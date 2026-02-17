// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title FlowCap Session Validator
 * @notice Validates session key permissions for ERC-4337 UserOperations
 * @dev Enforces per-key allowlists and blocks transfer/transferFrom
 *
 * Security model:
 *  - Each session key has an explicit list of (target, selector) pairs
 *  - `transfer` (0xa9059cbb) and `transferFrom` (0x23b872dd) are globally blocked
 *  - Each key has a spending cap (valueLimit) and expiry timestamp
 *  - Rate limiting: maxOpsPerHour / maxOpsPerDay
 */

/* ───────────────────────── Data Structures ───────────────────────── */

struct Permission {
    address target;           // Contract the session key may call
    bytes4  functionSelector; // Allowed function selector
    uint256 valueLimit;       // Max cumulative spend (in wei) for this (target, selector) pair
}

struct SessionKey {
    address keyAddress;       // Session key signer address
    uint48  validAfter;       // Unix timestamp — key not valid before this
    uint48  validUntil;       // Unix timestamp — key invalid after this
    uint256 totalValueLimit;  // Aggregate cap across all permissions
    uint256 totalValueUsed;   // Running total of value spent
    uint16  maxOpsPerHour;    // Rate limit per hour (0 = unlimited)
    uint16  maxOpsPerDay;     // Rate limit per day  (0 = unlimited)
    bool    revoked;          // Owner can revoke at any time
}

/* ───────────────────────── Events ────────────────────────────────── */

event SessionKeyRegistered(
    address indexed smartAccount,
    address indexed sessionKey,
    uint48 validUntil,
    uint256 totalValueLimit
);

event SessionKeyRevoked(
    address indexed smartAccount,
    address indexed sessionKey
);

event OperationValidated(
    address indexed smartAccount,
    address indexed sessionKey,
    address target,
    bytes4  selector,
    uint256 value
);

event OperationBlocked(
    address indexed smartAccount,
    address indexed sessionKey,
    address target,
    bytes4  selector,
    string  reason
);

/* ───────────────────────── Errors ────────────────────────────────── */

error SessionKeyExpired();
error SessionKeyRevoked_();
error SessionKeyNotFound();
error FunctionBlocked(bytes4 selector);
error PermissionDenied(address target, bytes4 selector);
error ValueLimitExceeded(uint256 requested, uint256 remaining);
error RateLimitExceeded(string period);
error InvalidSessionKey();

/* ───────────────────────── Contract ─────────────────────────────── */

contract SessionValidator {

    // ─── Globally blocked selectors (transfer & transferFrom) ─────
    bytes4 private constant TRANSFER_SELECTOR         = 0xa9059cbb;
    bytes4 private constant TRANSFER_FROM_SELECTOR    = 0x23b872dd;

    // ─── Storage ──────────────────────────────────────────────────
    // smartAccount => sessionKeyAddress => SessionKey
    mapping(address => mapping(address => SessionKey)) public sessionKeys;

    // smartAccount => sessionKey => keccak256(target, selector) => allowed
    mapping(address => mapping(address => mapping(bytes32 => bool))) public permissions;

    // smartAccount => sessionKey => keccak256(target, selector) => value used
    mapping(address => mapping(address => mapping(bytes32 => uint256))) public valueUsed;

    // Rate limit tracking: smartAccount => sessionKey => hour/day bucket => count
    mapping(address => mapping(address => mapping(uint256 => uint256))) public opsPerHour;
    mapping(address => mapping(address => mapping(uint256 => uint256))) public opsPerDay;

    // ─── Modifiers ────────────────────────────────────────────────

    modifier onlySmartAccountOwner(address smartAccount) {
        // In production, verify msg.sender == owner of the smart account
        // For ERC-4337: this is called by the smart account itself during validateUserOp
        require(msg.sender == smartAccount, "Not smart account");
        _;
    }

    // ─── Registration ─────────────────────────────────────────────

    /**
     * @notice Register a new session key with permissions
     * @param sessionKeyAddress  The session key signer address
     * @param validAfter         Unix timestamp — key valid from
     * @param validUntil         Unix timestamp — key valid until
     * @param totalValueLimit    Aggregate spending cap
     * @param maxOpsPerHour_     Rate limit per hour (0 = unlimited)
     * @param maxOpsPerDay_      Rate limit per day  (0 = unlimited)
     * @param perms              Array of allowed (target, selector, valueLimit) tuples
     */
    function registerSessionKey(
        address sessionKeyAddress,
        uint48  validAfter,
        uint48  validUntil,
        uint256 totalValueLimit,
        uint16  maxOpsPerHour_,
        uint16  maxOpsPerDay_,
        Permission[] calldata perms
    ) external onlySmartAccountOwner(msg.sender) {
        if (sessionKeyAddress == address(0)) revert InvalidSessionKey();

        SessionKey storage sk = sessionKeys[msg.sender][sessionKeyAddress];
        sk.keyAddress      = sessionKeyAddress;
        sk.validAfter      = validAfter;
        sk.validUntil      = validUntil;
        sk.totalValueLimit = totalValueLimit;
        sk.totalValueUsed  = 0;
        sk.maxOpsPerHour   = maxOpsPerHour_;
        sk.maxOpsPerDay    = maxOpsPerDay_;
        sk.revoked         = false;

        // Store individual permissions
        for (uint256 i = 0; i < perms.length; i++) {
            bytes32 permKey = keccak256(abi.encodePacked(perms[i].target, perms[i].functionSelector));
            permissions[msg.sender][sessionKeyAddress][permKey] = true;
        }

        emit SessionKeyRegistered(msg.sender, sessionKeyAddress, validUntil, totalValueLimit);
    }

    /**
     * @notice Revoke a session key immediately
     */
    function revokeSessionKey(
        address sessionKeyAddress
    ) external onlySmartAccountOwner(msg.sender) {
        SessionKey storage sk = sessionKeys[msg.sender][sessionKeyAddress];
        if (sk.keyAddress == address(0)) revert SessionKeyNotFound();

        sk.revoked = true;

        emit SessionKeyRevoked(msg.sender, sessionKeyAddress);
    }

    // ─── Validation ───────────────────────────────────────────────

    /**
     * @notice Validate a UserOperation against session key permissions
     * @dev Called by the smart account during validateUserOp
     * @param smartAccount  The smart account executing the operation
     * @param sessionKey    The session key that signed the operation
     * @param target        The contract being called
     * @param callData      The full calldata of the operation
     * @param value         The ETH/BNB value sent with the call
     * @return valid        True if the operation is permitted
     */
    function validateOperation(
        address smartAccount,
        address sessionKey,
        address target,
        bytes   calldata callData,
        uint256 value
    ) external returns (bool valid) {
        SessionKey storage sk = sessionKeys[smartAccount][sessionKey];

        // 1. Key must exist
        if (sk.keyAddress == address(0)) revert SessionKeyNotFound();

        // 2. Key must not be revoked
        if (sk.revoked) revert SessionKeyRevoked_();

        // 3. Key must be within validity window
        if (block.timestamp < sk.validAfter || block.timestamp > sk.validUntil) {
            revert SessionKeyExpired();
        }

        // 4. Extract function selector from calldata
        bytes4 selector;
        if (callData.length >= 4) {
            selector = bytes4(callData[:4]);
        }

        // 5. GLOBAL BLOCK: transfer() and transferFrom() — unconditional
        if (selector == TRANSFER_SELECTOR || selector == TRANSFER_FROM_SELECTOR) {
            emit OperationBlocked(smartAccount, sessionKey, target, selector, "transfer blocked");
            revert FunctionBlocked(selector);
        }

        // 6. Check (target, selector) is in the permission allowlist
        bytes32 permKey = keccak256(abi.encodePacked(target, selector));
        if (!permissions[smartAccount][sessionKey][permKey]) {
            emit OperationBlocked(smartAccount, sessionKey, target, selector, "not in allowlist");
            revert PermissionDenied(target, selector);
        }

        // 7. Check aggregate spending cap
        if (sk.totalValueUsed + value > sk.totalValueLimit) {
            emit OperationBlocked(smartAccount, sessionKey, target, selector, "value limit exceeded");
            revert ValueLimitExceeded(value, sk.totalValueLimit - sk.totalValueUsed);
        }

        // 8. Rate limiting
        if (sk.maxOpsPerHour > 0) {
            uint256 hourBucket = block.timestamp / 3600;
            if (opsPerHour[smartAccount][sessionKey][hourBucket] >= sk.maxOpsPerHour) {
                revert RateLimitExceeded("hourly");
            }
            opsPerHour[smartAccount][sessionKey][hourBucket]++;
        }

        if (sk.maxOpsPerDay > 0) {
            uint256 dayBucket = block.timestamp / 86400;
            if (opsPerDay[smartAccount][sessionKey][dayBucket] >= sk.maxOpsPerDay) {
                revert RateLimitExceeded("daily");
            }
            opsPerDay[smartAccount][sessionKey][dayBucket]++;
        }

        // 9. Update spending
        sk.totalValueUsed += value;

        emit OperationValidated(smartAccount, sessionKey, target, selector, value);

        return true;
    }

    // ─── View functions ───────────────────────────────────────────

    /**
     * @notice Check remaining spending allowance for a session key
     */
    function getRemainingAllowance(
        address smartAccount,
        address sessionKey
    ) external view returns (uint256) {
        SessionKey storage sk = sessionKeys[smartAccount][sessionKey];
        if (sk.totalValueLimit <= sk.totalValueUsed) return 0;
        return sk.totalValueLimit - sk.totalValueUsed;
    }

    /**
     * @notice Check if a session key is currently valid (not expired, not revoked)
     */
    function isSessionKeyValid(
        address smartAccount,
        address sessionKey
    ) external view returns (bool) {
        SessionKey storage sk = sessionKeys[smartAccount][sessionKey];
        return sk.keyAddress != address(0)
            && !sk.revoked
            && block.timestamp >= sk.validAfter
            && block.timestamp <= sk.validUntil;
    }

    /**
     * @notice Check if a specific (target, selector) is allowed for a session key
     */
    function isPermissionAllowed(
        address smartAccount,
        address sessionKey,
        address target,
        bytes4  selector
    ) external view returns (bool) {
        // Global block
        if (selector == TRANSFER_SELECTOR || selector == TRANSFER_FROM_SELECTOR) {
            return false;
        }
        bytes32 permKey = keccak256(abi.encodePacked(target, selector));
        return permissions[smartAccount][sessionKey][permKey];
    }
}
