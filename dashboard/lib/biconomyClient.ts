/**
 * Biconomy Client - Browser Implementation
 * Handles smart account creation and session key delegation
 */

import { type Address, type Hex, createPublicClient, http } from 'viem';
import { bsc } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Session key permission structure
export interface SessionKeyPermission {
  target: Address;
  functionSelector: Hex;
  valueLimit: bigint;
}

export interface SessionKeyData {
  sessionAddress: Address;
  sessionPrivateKey: Hex;
  validUntil: number; // Unix timestamp
  validAfter: number; // Unix timestamp
  permissions: SessionKeyPermission[];
}

export interface SmartAccount {
  address: Address;
  owner: Address;
}

/**
 * Create/Get Biconomy Smart Account for a user
 * In production, this would use Biconomy SDK
 */
export async function createSmartAccount(ownerAddress: Address): Promise<SmartAccount> {
  // For now, we'll use a deterministic smart account address
  // In production: Use Biconomy SDK's createSmartAccountClient()

  // This is a placeholder - in real implementation, you'd:
  // 1. Call Biconomy bundler to get/create smart account
  // 2. Return the smart account address

  // For demo purposes, derive from owner address
  const smartAccountAddress = deriveSmartAccountAddress(ownerAddress);

  return {
    address: smartAccountAddress,
    owner: ownerAddress,
  };
}

/**
 * Generate a new session key with permissions
 */
export function generateSessionKey(smartAccountAddress: Address): SessionKeyData {
  // Generate random private key for session
  const sessionPrivateKey = generateRandomPrivateKey();
  const sessionAccount = privateKeyToAccount(sessionPrivateKey);

  // Session valid for 7 days
  const now = Math.floor(Date.now() / 1000);
  const validAfter = now;
  const validUntil = now + 7 * 24 * 60 * 60; // 7 days

  // Build FlowCap permissions
  const permissions = buildFlowCapPermissions();

  return {
    sessionAddress: sessionAccount.address,
    sessionPrivateKey,
    validUntil,
    validAfter,
    permissions,
  };
}

/**
 * Build FlowCap-specific session key permissions
 * Only allows swaps, supply, and withdraw on approved protocols
 */
function buildFlowCapPermissions(): SessionKeyPermission[] {
  // Function selectors
  const SWAP_EXACT_TOKENS_FOR_TOKENS = '0x38ed1739'; // PancakeSwap
  const SWAP_EXACT_ETH_FOR_TOKENS = '0x7ff36ab5';
  const SWAP_EXACT_TOKENS_FOR_ETH = '0x18cbafe5';
  const MINT = '0xa0712d68'; // Venus supply
  const REDEEM_UNDERLYING = '0x852a12e3'; // Venus withdraw
  const APPROVE = '0x095ea7b3'; // ERC20 approve

  // Contract addresses (BNB Chain mainnet)
  const PANCAKESWAP_ROUTER_V2 = '0x10ED43C718714eb63d5aA57B78B54704E256024E' as Address;
  const PANCAKESWAP_ROUTER_V3 = '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4' as Address;
  const VENUS_VUSDT = '0xfD5840Cd36d94D7229439859C0112a4185BC0255' as Address;
  const VENUS_VUSDC = '0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8' as Address;
  const VENUS_VBNB = '0xA07c5b74C9B40447a954e1466938b865b6BBea36' as Address;
  const USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955' as Address;
  const USDC_ADDRESS = '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d' as Address;
  const WBNB_ADDRESS = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' as Address;

  const MAX_TX_VALUE = BigInt('10000000000000000000000'); // 10k tokens

  return [
    // PancakeSwap V2 - Swaps
    { target: PANCAKESWAP_ROUTER_V2, functionSelector: SWAP_EXACT_TOKENS_FOR_TOKENS as Hex, valueLimit: MAX_TX_VALUE },
    { target: PANCAKESWAP_ROUTER_V2, functionSelector: SWAP_EXACT_ETH_FOR_TOKENS as Hex, valueLimit: MAX_TX_VALUE },
    { target: PANCAKESWAP_ROUTER_V2, functionSelector: SWAP_EXACT_TOKENS_FOR_ETH as Hex, valueLimit: MAX_TX_VALUE },

    // PancakeSwap V3 - Swaps
    { target: PANCAKESWAP_ROUTER_V3, functionSelector: SWAP_EXACT_TOKENS_FOR_TOKENS as Hex, valueLimit: MAX_TX_VALUE },
    { target: PANCAKESWAP_ROUTER_V3, functionSelector: SWAP_EXACT_ETH_FOR_TOKENS as Hex, valueLimit: MAX_TX_VALUE },
    { target: PANCAKESWAP_ROUTER_V3, functionSelector: SWAP_EXACT_TOKENS_FOR_ETH as Hex, valueLimit: MAX_TX_VALUE },

    // Venus Protocol - Supply (mint)
    { target: VENUS_VUSDT, functionSelector: MINT as Hex, valueLimit: MAX_TX_VALUE },
    { target: VENUS_VUSDC, functionSelector: MINT as Hex, valueLimit: MAX_TX_VALUE },
    { target: VENUS_VBNB, functionSelector: MINT as Hex, valueLimit: MAX_TX_VALUE },

    // Venus Protocol - Withdraw (redeem)
    { target: VENUS_VUSDT, functionSelector: REDEEM_UNDERLYING as Hex, valueLimit: MAX_TX_VALUE },
    { target: VENUS_VUSDC, functionSelector: REDEEM_UNDERLYING as Hex, valueLimit: MAX_TX_VALUE },
    { target: VENUS_VBNB, functionSelector: REDEEM_UNDERLYING as Hex, valueLimit: MAX_TX_VALUE },

    // Token approvals (required for swaps/supply)
    { target: USDT_ADDRESS, functionSelector: APPROVE as Hex, valueLimit: MAX_TX_VALUE },
    { target: USDC_ADDRESS, functionSelector: APPROVE as Hex, valueLimit: MAX_TX_VALUE },
    { target: WBNB_ADDRESS, functionSelector: APPROVE as Hex, valueLimit: MAX_TX_VALUE },
  ];
}

/**
 * Generate a random private key
 */
function generateRandomPrivateKey(): Hex {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  return `0x${Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}` as Hex;
}

/**
 * Derive deterministic smart account address from owner
 * In production: Use Biconomy's actual smart account factory
 */
function deriveSmartAccountAddress(ownerAddress: Address): Address {
  // This is a placeholder implementation
  // In production, you'd call Biconomy's smart account factory
  // to get the actual counterfactual address

  // For now, we'll use a simple derivation
  // Real implementation would be:
  // const smartAccount = await biconomySDK.getSmartAccountAddress(ownerAddress)

  return ownerAddress; // Temporary: use EOA address
}

/**
 * Submit a UserOperation to Biconomy bundler
 * This is called when the agent executes a transaction
 */
export async function submitUserOperation(
  userOp: any,
  sessionPrivateKey: Hex
): Promise<{ userOpHash: string; bundlerResponse: any }> {
  const bundlerUrl = process.env.NEXT_PUBLIC_BICONOMY_BUNDLER_URL;
  const paymasterUrl = process.env.NEXT_PUBLIC_BICONOMY_PAYMASTER_URL;

  if (!bundlerUrl || bundlerUrl.includes('YOUR_KEY')) {
    throw new Error('Biconomy bundler URL not configured. Add NEXT_PUBLIC_BICONOMY_BUNDLER_URL to .env');
  }

  if (!paymasterUrl || paymasterUrl.includes('YOUR_KEY')) {
    throw new Error('Biconomy paymaster URL not configured. Add NEXT_PUBLIC_BICONOMY_PAYMASTER_URL to .env');
  }

  // Sign the userOp with session key
  const sessionAccount = privateKeyToAccount(sessionPrivateKey);

  // In production: Use Biconomy SDK to:
  // 1. Get paymaster signature
  // 2. Submit to bundler
  // 3. Wait for UserOp receipt

  // For now, throw an informative error
  throw new Error('UserOperation submission not yet implemented. Integrate Biconomy SDK.');
}
