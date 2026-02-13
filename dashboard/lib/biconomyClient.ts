/**
 * Biconomy Smart Account Client for Dashboard
 * Handles smart account creation and session key delegation
 */

import { createWalletClient, createPublicClient, http, type Address, type Hex } from 'viem';
import { bsc } from 'viem/chains';

// Biconomy Configuration
const BICONOMY_BUNDLER_URL =
  process.env.NEXT_PUBLIC_BICONOMY_BUNDLER_URL ||
  'https://bundler.biconomy.io/api/v2/56/YOUR_BUNDLER_KEY';
const BICONOMY_PAYMASTER_URL =
  process.env.NEXT_PUBLIC_BICONOMY_PAYMASTER_URL ||
  'https://paymaster.biconomy.io/api/v1/56/YOUR_PAYMASTER_KEY';
const ENTRY_POINT = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'; // Standard ERC-4337 EntryPoint

export interface SmartAccountInfo {
  address: Address;
  owner: Address;
  deployed: boolean;
}

export interface SessionKeyData {
  sessionPrivateKey: Hex;
  sessionAddress: Address;
  permissions: SessionKeyPermission[];
  validUntil: number;
  validAfter: number;
}

export interface SessionKeyPermission {
  target: Address;
  functionSelector: Hex;
  valueLimit: string;
}

/**
 * Create or get smart account for user
 */
export async function createSmartAccount(ownerAddress: Address): Promise<SmartAccountInfo> {
  // In a real implementation, this would use Biconomy SDK
  // For now, return a deterministic address based on owner

  // This is a simplified version. In production:
  // 1. Use Biconomy's SmartAccount SDK
  // 2. Deploy the account if not already deployed
  // 3. Return the actual on-chain address

  const publicClient = createPublicClient({
    chain: bsc,
    transport: http(process.env.NEXT_PUBLIC_BNB_RPC_URL || 'https://bsc-dataseed1.binance.org'),
  });

  // For demo purposes, use a deterministic address
  // In production, call Biconomy SDK to get actual smart account address
  const smartAccountAddress = `0x${ownerAddress.slice(2, 42)}` as Address;

  return {
    address: smartAccountAddress,
    owner: ownerAddress,
    deployed: false, // Check on-chain in production
  };
}

/**
 * Generate session key with FlowCap permissions
 */
export function generateSessionKey(smartAccountAddress: Address): SessionKeyData {
  // Generate random private key for session
  const sessionPrivateKey = generateRandomPrivateKey();
  const sessionAddress = privateKeyToAddress(sessionPrivateKey);

  // Build FlowCap-specific permissions
  const permissions = buildFlowCapPermissions();

  // 7-day validity
  const validAfter = Math.floor(Date.now() / 1000);
  const validUntil = validAfter + 7 * 24 * 60 * 60;

  return {
    sessionPrivateKey,
    sessionAddress,
    permissions,
    validUntil,
    validAfter,
  };
}

/**
 * Build FlowCap session key permissions (anti-drainage policy)
 */
function buildFlowCapPermissions(): SessionKeyPermission[] {
  const PANCAKESWAP_ROUTER = '0x10ED43C718714eb63d5aA57B78B54704E256024E';
  const VENUS_VUSDT = '0xfD5840Cd36d94D7229439859C0112a4185BC0255';
  const VENUS_VUSDC = '0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8';
  const VENUS_VBNB = '0xA07c5b74C9B40447a954e1466938b865b6BBea36';
  const USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
  const USDC_ADDRESS = '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d';

  const MAX_TX_VALUE = '10000000000000000000000'; // 10k tokens

  return [
    // PancakeSwap - swaps only (NO transfers)
    {
      target: PANCAKESWAP_ROUTER as Address,
      functionSelector: '0x38ed1739' as Hex, // swapExactTokensForTokens
      valueLimit: MAX_TX_VALUE,
    },
    {
      target: PANCAKESWAP_ROUTER as Address,
      functionSelector: '0x7ff36ab5' as Hex, // swapExactETHForTokens
      valueLimit: MAX_TX_VALUE,
    },

    // Venus Protocol - supply and withdraw only
    {
      target: VENUS_VUSDT as Address,
      functionSelector: '0xa0712d68' as Hex, // mint
      valueLimit: MAX_TX_VALUE,
    },
    {
      target: VENUS_VUSDC as Address,
      functionSelector: '0xa0712d68' as Hex, // mint
      valueLimit: MAX_TX_VALUE,
    },
    {
      target: VENUS_VBNB as Address,
      functionSelector: '0xa0712d68' as Hex, // mint
      valueLimit: MAX_TX_VALUE,
    },
    {
      target: VENUS_VUSDT as Address,
      functionSelector: '0x852a12e3' as Hex, // redeemUnderlying
      valueLimit: MAX_TX_VALUE,
    },
    {
      target: VENUS_VUSDC as Address,
      functionSelector: '0x852a12e3' as Hex, // redeemUnderlying
      valueLimit: MAX_TX_VALUE,
    },

    // ERC20 approvals (needed for swaps and supply)
    {
      target: USDT_ADDRESS as Address,
      functionSelector: '0x095ea7b3' as Hex, // approve
      valueLimit: MAX_TX_VALUE,
    },
    {
      target: USDC_ADDRESS as Address,
      functionSelector: '0x095ea7b3' as Hex, // approve
      valueLimit: MAX_TX_VALUE,
    },
  ];
}

/**
 * Delegate session key to agent (sign session key module data)
 */
export async function delegateSessionKey(
  smartAccountAddress: Address,
  sessionKeyData: SessionKeyData,
  signer: any // wagmi signer
): Promise<{
  success: boolean;
  signature?: Hex;
  error?: string;
}> {
  try {
    // Build the session key module data
    // This would be signed by the user's wallet to authorize the session key

    const moduleData = {
      sessionKey: sessionKeyData.sessionAddress,
      validUntil: sessionKeyData.validUntil,
      validAfter: sessionKeyData.validAfter,
      permissions: sessionKeyData.permissions,
    };

    // In production, use Biconomy's SessionKeyManagerModule
    // For now, just sign the data
    const message = JSON.stringify(moduleData);

    // Request signature from user wallet
    const signature = await signer.signMessage({ message });

    return {
      success: true,
      signature,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delegate session key',
    };
  }
}

/**
 * Encrypt session key for secure transmission to agent
 */
export function encryptSessionKey(sessionPrivateKey: Hex, password: string): string {
  // In production, use proper encryption (e.g., AES-256-GCM)
  // For now, just base64 encode (THIS IS NOT SECURE - USE REAL ENCRYPTION)

  const data = JSON.stringify({
    key: sessionPrivateKey,
    timestamp: Date.now(),
  });

  // WARNING: This is NOT secure encryption, just for demo
  // In production, use @metamask/eth-sig-util or similar
  const encrypted = Buffer.from(data).toString('base64');

  return encrypted;
}

/**
 * Decrypt session key
 */
export function decryptSessionKey(encrypted: string, password: string): Hex | null {
  try {
    // WARNING: This matches the demo encryption above
    // In production, use proper decryption
    const data = JSON.parse(Buffer.from(encrypted, 'base64').toString());
    return data.key as Hex;
  } catch {
    return null;
  }
}

/**
 * Check if Biconomy is properly configured
 */
export function isBiconomyConfigured(): {
  configured: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  if (!BICONOMY_BUNDLER_URL || BICONOMY_BUNDLER_URL.includes('YOUR')) {
    issues.push('Biconomy Bundler URL not configured');
  }

  if (!BICONOMY_PAYMASTER_URL || BICONOMY_PAYMASTER_URL.includes('YOUR')) {
    issues.push('Biconomy Paymaster URL not configured');
  }

  return {
    configured: issues.length === 0,
    issues,
  };
}

// Helper functions

function generateRandomPrivateKey(): Hex {
  const randomBytes = new Uint8Array(32);
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(randomBytes);
  } else {
    // Node.js environment
    const crypto = require('crypto');
    crypto.randomFillSync(randomBytes);
  }

  return `0x${Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}` as Hex;
}

function privateKeyToAddress(privateKey: Hex): Address {
  // Simplified - in production, use proper key derivation
  // This is just for demo purposes
  return `0x${privateKey.slice(26, 66)}` as Address;
}

export default {
  createSmartAccount,
  generateSessionKey,
  delegateSessionKey,
  encryptSessionKey,
  decryptSessionKey,
  isBiconomyConfigured,
};
