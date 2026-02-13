/**
 * Biconomy Session Key Manager
 * Handles session key creation, validation, and management
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  type Address,
  type Hex,
  type Account,
} from 'viem';
import { bsc } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Biconomy SDK types (we'll use manual implementation for now)
export interface SessionKeyPermission {
  target: Address;
  functionSelector: Hex;
  valueLimit: bigint;
  rules?: SessionKeyRule[];
}

export interface SessionKeyRule {
  offset: number;
  condition: 'EQUAL' | 'GREATER_THAN' | 'LESS_THAN';
  value: Hex;
}

export interface SessionKeyData {
  sessionKeyAddress: Address;
  validUntil: number; // Unix timestamp
  validAfter: number; // Unix timestamp
  permissions: SessionKeyPermission[];
  enabled: boolean;
}

export interface SessionKeyConfig {
  smartAccountAddress: Address;
  sessionPrivateKey: Hex;
  validityDurationSeconds?: number; // Default: 7 days
  permissions?: SessionKeyPermission[];
}

/**
 * Create a new session key account
 */
export function createSessionKeyAccount(privateKey?: Hex): {
  account: Account;
  address: Address;
  privateKey: Hex;
} {
  // If no private key provided, generate a new one
  const key = privateKey || generateRandomPrivateKey();
  const account = privateKeyToAccount(key);

  return {
    account,
    address: account.address,
    privateKey: key,
  };
}

/**
 * Generate a random private key for session
 */
function generateRandomPrivateKey(): Hex {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  return `0x${Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}` as Hex;
}

/**
 * Build session key permissions based on FlowCap's allowed operations
 */
export function buildFlowCapPermissions(): SessionKeyPermission[] {
  // Function selectors for allowed operations
  const SWAP_EXACT_TOKENS_FOR_TOKENS = '0x38ed1739'; // PancakeSwap
  const SWAP_EXACT_ETH_FOR_TOKENS = '0x7ff36ab5';
  const SWAP_EXACT_TOKENS_FOR_ETH = '0x18cbafe5';
  const MINT = '0xa0712d68'; // Venus supply
  const REDEEM_UNDERLYING = '0x852a12e3'; // Venus withdraw
  const APPROVE = '0x095ea7b3'; // ERC20 approve

  // Contract addresses from env
  const PANCAKESWAP_ROUTER = (process.env.PANCAKESWAP_ROUTER_V2 ||
    '0x10ED43C718714eb63d5aA57B78B54704E256024E') as Address;
  const VENUS_VUSDT = (process.env.VENUS_VUSDT ||
    '0xfD5840Cd36d94D7229439859C0112a4185BC0255') as Address;
  const VENUS_VUSDC = (process.env.VENUS_VUSDC ||
    '0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8') as Address;
  const VENUS_VBNB = (process.env.VENUS_VBNB ||
    '0xA07c5b74C9B40447a954e1466938b865b6BBea36') as Address;
  const USDT_ADDRESS = (process.env.USDT_ADDRESS ||
    '0x55d398326f99059fF775485246999027B3197955') as Address;
  const USDC_ADDRESS = (process.env.USDC_ADDRESS ||
    '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d') as Address;

  const MAX_TX_VALUE = BigInt(process.env.MAX_TX_VALUE_WEI || '10000000000000000000000'); // 10k tokens

  return [
    // PancakeSwap Router - Swaps
    {
      target: PANCAKESWAP_ROUTER,
      functionSelector: SWAP_EXACT_TOKENS_FOR_TOKENS as Hex,
      valueLimit: MAX_TX_VALUE,
    },
    {
      target: PANCAKESWAP_ROUTER,
      functionSelector: SWAP_EXACT_ETH_FOR_TOKENS as Hex,
      valueLimit: MAX_TX_VALUE,
    },
    {
      target: PANCAKESWAP_ROUTER,
      functionSelector: SWAP_EXACT_TOKENS_FOR_ETH as Hex,
      valueLimit: MAX_TX_VALUE,
    },

    // Venus Protocol - Supply (mint)
    {
      target: VENUS_VUSDT,
      functionSelector: MINT as Hex,
      valueLimit: MAX_TX_VALUE,
    },
    {
      target: VENUS_VUSDC,
      functionSelector: MINT as Hex,
      valueLimit: MAX_TX_VALUE,
    },
    {
      target: VENUS_VBNB,
      functionSelector: MINT as Hex,
      valueLimit: MAX_TX_VALUE,
    },

    // Venus Protocol - Withdraw (redeem)
    {
      target: VENUS_VUSDT,
      functionSelector: REDEEM_UNDERLYING as Hex,
      valueLimit: MAX_TX_VALUE,
    },
    {
      target: VENUS_VUSDC,
      functionSelector: REDEEM_UNDERLYING as Hex,
      valueLimit: MAX_TX_VALUE,
    },
    {
      target: VENUS_VBNB,
      functionSelector: REDEEM_UNDERLYING as Hex,
      valueLimit: MAX_TX_VALUE,
    },

    // ERC20 Approvals (needed before swaps/supply)
    {
      target: USDT_ADDRESS,
      functionSelector: APPROVE as Hex,
      valueLimit: MAX_TX_VALUE,
    },
    {
      target: USDC_ADDRESS,
      functionSelector: APPROVE as Hex,
      valueLimit: MAX_TX_VALUE,
    },
  ];
}

/**
 * Session Key Manager class
 */
export class SessionKeyManager {
  private publicClient;
  private walletClient;
  private sessionAccount: Account | null = null;

  constructor(
    private config: SessionKeyConfig
  ) {
    this.publicClient = createPublicClient({
      chain: bsc,
      transport: http(process.env.BNB_RPC_URL || 'https://bsc-dataseed1.binance.org'),
    });

    // Initialize session account if private key provided
    if (config.sessionPrivateKey) {
      this.sessionAccount = privateKeyToAccount(config.sessionPrivateKey);
      this.walletClient = createWalletClient({
        account: this.sessionAccount,
        chain: bsc,
        transport: http(process.env.BNB_RPC_URL || 'https://bsc-dataseed1.binance.org'),
      });
    }
  }

  /**
   * Get session key data
   */
  getSessionKeyData(): SessionKeyData | null {
    if (!this.sessionAccount) {
      return null;
    }

    const validityDuration = this.config.validityDurationSeconds || 7 * 24 * 60 * 60; // 7 days
    const now = Math.floor(Date.now() / 1000);

    return {
      sessionKeyAddress: this.sessionAccount.address,
      validUntil: now + validityDuration,
      validAfter: now,
      permissions: this.config.permissions || buildFlowCapPermissions(),
      enabled: true,
    };
  }

  /**
   * Check if session key is still valid
   */
  isValid(): boolean {
    if (!this.sessionAccount) {
      return false;
    }

    const data = this.getSessionKeyData();
    if (!data) {
      return false;
    }

    const now = Math.floor(Date.now() / 1000);
    return data.enabled && now >= data.validAfter && now <= data.validUntil;
  }

  /**
   * Get remaining validity time in seconds
   */
  getRemainingValidity(): number {
    const data = this.getSessionKeyData();
    if (!data) {
      return 0;
    }

    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, data.validUntil - now);
  }

  /**
   * Check if an operation is allowed by session key permissions
   */
  isOperationAllowed(target: Address, functionSelector: Hex): boolean {
    const data = this.getSessionKeyData();
    if (!data || !data.enabled) {
      return false;
    }

    // Check if the target and function are in the permissions list
    return data.permissions.some(
      (perm) =>
        perm.target.toLowerCase() === target.toLowerCase() &&
        perm.functionSelector.toLowerCase() === functionSelector.toLowerCase()
    );
  }

  /**
   * Get session account for signing
   */
  getSessionAccount(): Account | null {
    return this.sessionAccount;
  }

  /**
   * Export session key data for storage
   */
  export(): {
    address: Address;
    privateKey: Hex;
    smartAccountAddress: Address;
    validUntil: number;
  } | null {
    if (!this.sessionAccount) {
      return null;
    }

    const data = this.getSessionKeyData();
    if (!data) {
      return null;
    }

    return {
      address: this.sessionAccount.address,
      privateKey: this.config.sessionPrivateKey,
      smartAccountAddress: this.config.smartAccountAddress,
      validUntil: data.validUntil,
    };
  }

  /**
   * Create session key data for dashboard to store
   */
  static generateSessionKeyForDashboard(smartAccountAddress: Address): {
    sessionPrivateKey: Hex;
    sessionAddress: Address;
    permissions: SessionKeyPermission[];
    validityDurationSeconds: number;
  } {
    const { privateKey, address } = createSessionKeyAccount();
    const permissions = buildFlowCapPermissions();
    const validityDurationSeconds = 7 * 24 * 60 * 60; // 7 days

    return {
      sessionPrivateKey: privateKey,
      sessionAddress: address,
      permissions,
      validityDurationSeconds,
    };
  }
}

/**
 * Helper: Load session key from environment
 */
export function loadSessionKeyFromEnv(): SessionKeyManager | null {
  const sessionPrivateKey = process.env.SESSION_PRIVATE_KEY as Hex | undefined;
  const smartAccountAddress = process.env.AGENT_WALLET_ADDRESS as Address | undefined;

  if (!sessionPrivateKey || !smartAccountAddress) {
    return null;
  }

  return new SessionKeyManager({
    smartAccountAddress,
    sessionPrivateKey,
    permissions: buildFlowCapPermissions(),
  });
}

/**
 * Validate session key configuration
 */
export function validateSessionKeyConfig(): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required environment variables
  if (!process.env.SESSION_PRIVATE_KEY) {
    errors.push('SESSION_PRIVATE_KEY not configured');
  }

  if (!process.env.AGENT_WALLET_ADDRESS) {
    errors.push('AGENT_WALLET_ADDRESS not configured');
  }

  if (!process.env.BICONOMY_BUNDLER_URL || !process.env.BICONOMY_BUNDLER_URL.includes('YOUR')) {
    warnings.push('BICONOMY_BUNDLER_URL not properly configured');
  }

  if (!process.env.BICONOMY_PAYMASTER_URL || !process.env.BICONOMY_PAYMASTER_URL.includes('YOUR')) {
    warnings.push('BICONOMY_PAYMASTER_URL not properly configured');
  }

  // Try to load and validate session key
  const manager = loadSessionKeyFromEnv();
  if (manager && !manager.isValid()) {
    warnings.push('Session key loaded but may be invalid or expired');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export default SessionKeyManager;
