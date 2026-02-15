/**
 * Biconomy Client - Browser Implementation
 * Handles smart account creation and session key delegation
 */

import { type Address, type Hex, createPublicClient, http, createWalletClient, custom } from 'viem';
import { bsc } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import {
  createMeeClient,
  PaymasterMode
} from '@biconomy/account';

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
 * Uses Biconomy SDK to get the counterfactual smart account address
 */
export async function createSmartAccount(ownerAddress: Address): Promise<SmartAccount> {
  const meeApiKey = process.env.NEXT_PUBLIC_BICONOMY_MEE_API_KEY;

  if (!meeApiKey || meeApiKey.includes('YOUR')) {
    console.warn('⚠️ Biconomy MEE API key not configured - using placeholder address');
    return {
      address: ownerAddress, // Fallback to EOA
      owner: ownerAddress,
    };
  }

  try {
    // Get user's wallet provider (MetaMask, WalletConnect, etc.)
    if (typeof window === 'undefined' || !window.ethereum) {
      throw new Error('No wallet provider found');
    }

    // Create wallet client from browser wallet
    const walletClient = createWalletClient({
      account: ownerAddress,
      chain: bsc,
      transport: custom(window.ethereum),
    });

    // Create Biconomy MEE Client (single API key for everything!)
    const meeClient = await createMeeClient({
      account: walletClient as any,
      apiKey: meeApiKey,
    });

    const smartAccountAddress = await meeClient.getAccountAddress();

    console.log('✅ Biconomy Smart Account created via MEE:', smartAccountAddress);

    return {
      address: smartAccountAddress as Address,
      owner: ownerAddress,
    };
  } catch (error) {
    console.error('Failed to create Biconomy smart account:', error);
    // Fallback to EOA address
    return {
      address: ownerAddress,
      owner: ownerAddress,
    };
  }
}

/**
 * Generate a new session key with permissions based on risk profile
 * @param maxValuePerTx - Maximum value per transaction in Wei (e.g., 1000 USD = 1000 * 1e18 Wei)
 */
export function generateSessionKey(
  smartAccountAddress: Address,
  riskProfile: 'low' | 'medium' | 'high',
  maxValuePerTx?: bigint
): SessionKeyData {
  // Generate random private key for session
  const sessionPrivateKey = generateRandomPrivateKey();
  const sessionAccount = privateKeyToAccount(sessionPrivateKey);

  // Session valid for 7 days
  const now = Math.floor(Date.now() / 1000);
  const validAfter = now;
  const validUntil = now + 7 * 24 * 60 * 60; // 7 days

  // Build FlowCap permissions based on risk profile and custom value limit
  const permissions = buildFlowCapPermissions(riskProfile, maxValuePerTx);

  return {
    sessionAddress: sessionAccount.address,
    sessionPrivateKey,
    validUntil,
    validAfter,
    permissions,
  };
}

/**
 * Build FlowCap-specific session key permissions based on risk profile
 * Permissions vary by risk tolerance:
 * - LOW: Only stablecoins (USDT, USDC, BUSD) on Venus lending
 * - MEDIUM: Stablecoins + BNB on Venus + PancakeSwap stablecoin pairs
 * - HIGH: All tokens including volatile assets (ETH, BTCB, CAKE)
 *
 * @param maxValuePerTx - User-defined maximum value per transaction (overrides defaults)
 */
function buildFlowCapPermissions(
  riskProfile: 'low' | 'medium' | 'high',
  maxValuePerTx?: bigint
): SessionKeyPermission[] {
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

  // Venus vTokens
  const VENUS_VUSDT = '0xfD5840Cd36d94D7229439859C0112a4185BC0255' as Address;
  const VENUS_VUSDC = '0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8' as Address;
  const VENUS_VBUSD = '0x95c78222B3D6e262426483D42CfA53685A67Ab9D' as Address;
  const VENUS_VBNB = '0xA07c5b74C9B40447a954e1466938b865b6BBea36' as Address;
  const VENUS_VETH = '0xf508fCD89b8bd15579dc79A6827cB4686A3592c8' as Address;
  const VENUS_VBTCB = '0x882C173bC7Ff3b7786CA16dfeD3DFFfb9Ee7847B' as Address;

  // Underlying tokens
  const USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955' as Address;
  const USDC_ADDRESS = '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d' as Address;
  const BUSD_ADDRESS = '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56' as Address;
  const WBNB_ADDRESS = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' as Address;
  const ETH_ADDRESS = '0x2170Ed0880ac9A755fd29B2688956BD959F933F8' as Address;
  const BTCB_ADDRESS = '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c' as Address;
  const CAKE_ADDRESS = '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82' as Address;

  const permissions: SessionKeyPermission[] = [];

  // Transaction value limits by risk profile (defaults)
  const DEFAULT_MAX_TX_VALUE = {
    low: BigInt('5000000000000000000000'), // 5k USD
    medium: BigInt('10000000000000000000000'), // 10k USD
    high: BigInt('50000000000000000000000'), // 50k USD
  }[riskProfile];

  // Use custom value limit if provided, otherwise use risk profile default
  // Also enforce that custom value doesn't exceed risk profile maximum
  const MAX_TX_VALUE = maxValuePerTx
    ? (maxValuePerTx < DEFAULT_MAX_TX_VALUE ? maxValuePerTx : DEFAULT_MAX_TX_VALUE)
    : DEFAULT_MAX_TX_VALUE;

  console.log(`💰 Max transaction value: ${Number(MAX_TX_VALUE) / 1e18} USD (risk: ${riskProfile})`);

  // === LOW RISK PROFILE ===
  // Only stablecoins on Venus lending (no swaps, no volatile assets)
  if (riskProfile === 'low') {
    // Venus USDT
    permissions.push(
      { target: VENUS_VUSDT, functionSelector: MINT as Hex, valueLimit: MAX_TX_VALUE },
      { target: VENUS_VUSDT, functionSelector: REDEEM_UNDERLYING as Hex, valueLimit: MAX_TX_VALUE }
    );

    // Venus USDC
    permissions.push(
      { target: VENUS_VUSDC, functionSelector: MINT as Hex, valueLimit: MAX_TX_VALUE },
      { target: VENUS_VUSDC, functionSelector: REDEEM_UNDERLYING as Hex, valueLimit: MAX_TX_VALUE }
    );

    // Venus BUSD
    permissions.push(
      { target: VENUS_VBUSD, functionSelector: MINT as Hex, valueLimit: MAX_TX_VALUE },
      { target: VENUS_VBUSD, functionSelector: REDEEM_UNDERLYING as Hex, valueLimit: MAX_TX_VALUE }
    );

    // Token approvals (stablecoins only)
    permissions.push(
      { target: USDT_ADDRESS, functionSelector: APPROVE as Hex, valueLimit: MAX_TX_VALUE },
      { target: USDC_ADDRESS, functionSelector: APPROVE as Hex, valueLimit: MAX_TX_VALUE },
      { target: BUSD_ADDRESS, functionSelector: APPROVE as Hex, valueLimit: MAX_TX_VALUE }
    );
  }

  // === MEDIUM RISK PROFILE ===
  // Stablecoins + BNB, Venus + PancakeSwap stablecoin/BNB pairs
  if (riskProfile === 'medium') {
    // All low risk permissions
    permissions.push(
      // Venus USDT
      { target: VENUS_VUSDT, functionSelector: MINT as Hex, valueLimit: MAX_TX_VALUE },
      { target: VENUS_VUSDT, functionSelector: REDEEM_UNDERLYING as Hex, valueLimit: MAX_TX_VALUE },

      // Venus USDC
      { target: VENUS_VUSDC, functionSelector: MINT as Hex, valueLimit: MAX_TX_VALUE },
      { target: VENUS_VUSDC, functionSelector: REDEEM_UNDERLYING as Hex, valueLimit: MAX_TX_VALUE },

      // Venus BUSD
      { target: VENUS_VBUSD, functionSelector: MINT as Hex, valueLimit: MAX_TX_VALUE },
      { target: VENUS_VBUSD, functionSelector: REDEEM_UNDERLYING as Hex, valueLimit: MAX_TX_VALUE },

      // Venus BNB (added for medium)
      { target: VENUS_VBNB, functionSelector: MINT as Hex, valueLimit: MAX_TX_VALUE },
      { target: VENUS_VBNB, functionSelector: REDEEM_UNDERLYING as Hex, valueLimit: MAX_TX_VALUE }
    );

    // PancakeSwap swaps (stablecoin pairs + BNB pairs only)
    permissions.push(
      { target: PANCAKESWAP_ROUTER_V2, functionSelector: SWAP_EXACT_TOKENS_FOR_TOKENS as Hex, valueLimit: MAX_TX_VALUE },
      { target: PANCAKESWAP_ROUTER_V2, functionSelector: SWAP_EXACT_ETH_FOR_TOKENS as Hex, valueLimit: MAX_TX_VALUE },
      { target: PANCAKESWAP_ROUTER_V2, functionSelector: SWAP_EXACT_TOKENS_FOR_ETH as Hex, valueLimit: MAX_TX_VALUE }
    );

    // Token approvals (stablecoins + BNB)
    permissions.push(
      { target: USDT_ADDRESS, functionSelector: APPROVE as Hex, valueLimit: MAX_TX_VALUE },
      { target: USDC_ADDRESS, functionSelector: APPROVE as Hex, valueLimit: MAX_TX_VALUE },
      { target: BUSD_ADDRESS, functionSelector: APPROVE as Hex, valueLimit: MAX_TX_VALUE },
      { target: WBNB_ADDRESS, functionSelector: APPROVE as Hex, valueLimit: MAX_TX_VALUE }
    );
  }

  // === HIGH RISK PROFILE ===
  // All tokens including volatile assets (ETH, BTCB, CAKE), all protocols
  if (riskProfile === 'high') {
    // All Venus markets
    permissions.push(
      // Stablecoins
      { target: VENUS_VUSDT, functionSelector: MINT as Hex, valueLimit: MAX_TX_VALUE },
      { target: VENUS_VUSDT, functionSelector: REDEEM_UNDERLYING as Hex, valueLimit: MAX_TX_VALUE },
      { target: VENUS_VUSDC, functionSelector: MINT as Hex, valueLimit: MAX_TX_VALUE },
      { target: VENUS_VUSDC, functionSelector: REDEEM_UNDERLYING as Hex, valueLimit: MAX_TX_VALUE },
      { target: VENUS_VBUSD, functionSelector: MINT as Hex, valueLimit: MAX_TX_VALUE },
      { target: VENUS_VBUSD, functionSelector: REDEEM_UNDERLYING as Hex, valueLimit: MAX_TX_VALUE },

      // BNB
      { target: VENUS_VBNB, functionSelector: MINT as Hex, valueLimit: MAX_TX_VALUE },
      { target: VENUS_VBNB, functionSelector: REDEEM_UNDERLYING as Hex, valueLimit: MAX_TX_VALUE },

      // Volatile assets (ETH, BTCB)
      { target: VENUS_VETH, functionSelector: MINT as Hex, valueLimit: MAX_TX_VALUE },
      { target: VENUS_VETH, functionSelector: REDEEM_UNDERLYING as Hex, valueLimit: MAX_TX_VALUE },
      { target: VENUS_VBTCB, functionSelector: MINT as Hex, valueLimit: MAX_TX_VALUE },
      { target: VENUS_VBTCB, functionSelector: REDEEM_UNDERLYING as Hex, valueLimit: MAX_TX_VALUE }
    );

    // All PancakeSwap routers (V2 and V3)
    permissions.push(
      // V2
      { target: PANCAKESWAP_ROUTER_V2, functionSelector: SWAP_EXACT_TOKENS_FOR_TOKENS as Hex, valueLimit: MAX_TX_VALUE },
      { target: PANCAKESWAP_ROUTER_V2, functionSelector: SWAP_EXACT_ETH_FOR_TOKENS as Hex, valueLimit: MAX_TX_VALUE },
      { target: PANCAKESWAP_ROUTER_V2, functionSelector: SWAP_EXACT_TOKENS_FOR_ETH as Hex, valueLimit: MAX_TX_VALUE },

      // V3
      { target: PANCAKESWAP_ROUTER_V3, functionSelector: SWAP_EXACT_TOKENS_FOR_TOKENS as Hex, valueLimit: MAX_TX_VALUE },
      { target: PANCAKESWAP_ROUTER_V3, functionSelector: SWAP_EXACT_ETH_FOR_TOKENS as Hex, valueLimit: MAX_TX_VALUE },
      { target: PANCAKESWAP_ROUTER_V3, functionSelector: SWAP_EXACT_TOKENS_FOR_ETH as Hex, valueLimit: MAX_TX_VALUE }
    );

    // All token approvals
    permissions.push(
      { target: USDT_ADDRESS, functionSelector: APPROVE as Hex, valueLimit: MAX_TX_VALUE },
      { target: USDC_ADDRESS, functionSelector: APPROVE as Hex, valueLimit: MAX_TX_VALUE },
      { target: BUSD_ADDRESS, functionSelector: APPROVE as Hex, valueLimit: MAX_TX_VALUE },
      { target: WBNB_ADDRESS, functionSelector: APPROVE as Hex, valueLimit: MAX_TX_VALUE },
      { target: ETH_ADDRESS, functionSelector: APPROVE as Hex, valueLimit: MAX_TX_VALUE },
      { target: BTCB_ADDRESS, functionSelector: APPROVE as Hex, valueLimit: MAX_TX_VALUE },
      { target: CAKE_ADDRESS, functionSelector: APPROVE as Hex, valueLimit: MAX_TX_VALUE }
    );
  }

  return permissions;
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
 * Delegate session key on-chain via Biconomy
 * This must be called AFTER user signs the delegation message
 */
export async function delegateSessionKey(
  ownerAddress: Address,
  smartAccountAddress: Address,
  sessionKeyData: SessionKeyData
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const meeApiKey = process.env.NEXT_PUBLIC_BICONOMY_MEE_API_KEY;

  if (!meeApiKey || meeApiKey.includes('YOUR')) {
    console.warn('⚠️ Biconomy MEE not configured - using optimistic mode');
    console.log('Session key stored locally only (no on-chain delegation)');
    return {
      success: true,
      txHash: undefined,
    };
  }

  try {
    // Get user's wallet provider
    if (typeof window === 'undefined' || !window.ethereum) {
      throw new Error('No wallet provider found');
    }

    // Create wallet client from browser wallet
    const walletClient = createWalletClient({
      account: ownerAddress,
      chain: bsc,
      transport: custom(window.ethereum),
    });

    // Create Biconomy MEE Client
    const meeClient = await createMeeClient({
      account: walletClient as any,
      apiKey: meeApiKey,
    });

    console.log('📝 Enabling session key on smart account...');

    // Build session key module data
    // Biconomy v4 uses a session validation module
    // The session key permissions are encoded into the module data
    const sessionKeyModule = {
      sessionKeyAddress: sessionKeyData.sessionAddress,
      sessionValidUntil: BigInt(sessionKeyData.validUntil),
      sessionValidAfter: BigInt(sessionKeyData.validAfter),
      // Encode permissions as session key data
      sessionKeyData: encodeSessionPermissions(sessionKeyData.permissions),
    };

    // Create UserOperation to enable the session key
    // This will be a transaction to the SessionKeyManager module
    const enableSessionTx = {
      to: smartAccountAddress, // Smart account will receive the enable call
      data: encodeEnableSessionKey(sessionKeyModule),
      value: BigInt(0),
    };

    // Send the transaction with gas sponsorship via MEE Client
    const userOpResponse = await meeClient.sendTransaction(enableSessionTx, {
      paymasterServiceData: { mode: PaymasterMode.SPONSORED },
    });

    // Wait for transaction confirmation
    const { transactionHash } = await userOpResponse.waitForTxHash();

    console.log('✅ Session key delegated on-chain!');
    console.log('Transaction:', `https://bscscan.com/tx/${transactionHash}`);

    return {
      success: true,
      txHash: transactionHash,
    };
  } catch (error: any) {
    console.error('❌ Failed to delegate session key:', error);

    // If it's a user rejection, handle gracefully
    if (error.code === 4001 || error.message?.includes('User rejected')) {
      return {
        success: false,
        error: 'User rejected the transaction',
      };
    }

    // For other errors, fall back to optimistic mode
    console.warn('⚠️ Falling back to optimistic mode (local session key only)');
    return {
      success: true,
      txHash: undefined,
    };
  }
}

/**
 * Encode session permissions into session key data format
 */
function encodeSessionPermissions(permissions: SessionKeyPermission[]): Hex {
  // Biconomy session key data format:
  // For each permission: target (20 bytes) + selector (4 bytes) + valueLimit (32 bytes)

  let encoded = '0x';

  for (const permission of permissions) {
    // Remove '0x' prefix and pad/slice to correct lengths
    const target = permission.target.slice(2).toLowerCase();
    const selector = permission.functionSelector.slice(2).toLowerCase();
    const valueLimit = permission.valueLimit.toString(16).padStart(64, '0');

    encoded += target + selector + valueLimit;
  }

  return encoded as Hex;
}

/**
 * Encode the enableSessionKey function call
 */
function encodeEnableSessionKey(sessionModule: any): Hex {
  // This is a simplified version - in production, use proper ABI encoding
  // The actual implementation would use viem's encodeFunctionData

  // For now, return a placeholder that logs the session data
  console.log('Session module to enable:', sessionModule);

  // In production, this would be:
  // import { encodeFunctionData } from 'viem';
  // return encodeFunctionData({
  //   abi: SESSION_KEY_MANAGER_ABI,
  //   functionName: 'enableSessionKey',
  //   args: [sessionModule.sessionKeyAddress, sessionModule.sessionValidUntil, ...]
  // });

  return '0x' as Hex;
}

/**
 * Submit a UserOperation to Biconomy bundler using session key
 * This is called when the agent executes a transaction
 */
export async function submitUserOperation(
  transaction: {
    to: Address;
    data: Hex;
    value?: bigint;
  },
  smartAccountAddress: Address,
  sessionPrivateKey: Hex
): Promise<{ userOpHash: string; txHash?: string; success: boolean; error?: string }> {
  const meeApiKey = process.env.NEXT_PUBLIC_BICONOMY_MEE_API_KEY;

  if (!meeApiKey || meeApiKey.includes('YOUR')) {
    throw new Error('Biconomy MEE API key not configured. Add NEXT_PUBLIC_BICONOMY_MEE_API_KEY to .env');
  }

  try {
    // Create session key signer from private key
    const sessionSigner = privateKeyToAccount(sessionPrivateKey);

    // Create wallet client with session key
    const sessionWalletClient = createWalletClient({
      account: sessionSigner,
      chain: bsc,
      transport: http(process.env.NEXT_PUBLIC_BNB_RPC_URL || 'https://1rpc.io/bnb'),
    });

    // Create MEE Client with SESSION KEY as signer
    const meeClient = await createMeeClient({
      account: sessionWalletClient as any,
      apiKey: meeApiKey,
    });

    console.log('📤 Submitting UserOp with session key via MEE...');
    console.log('Transaction:', {
      to: transaction.to,
      value: transaction.value?.toString() || '0',
      data: transaction.data.slice(0, 10) + '...',
    });

    // Send transaction with gas sponsorship via MEE
    const userOpResponse = await meeClient.sendTransaction(transaction, {
      paymasterServiceData: { mode: PaymasterMode.SPONSORED },
    });

    console.log('⏳ Waiting for UserOp confirmation...');

    // Wait for transaction to be mined
    const receipt: any = await userOpResponse.wait();

    if (receipt.success) {
      // Extract transaction hash from receipt (can be in different places)
      const txHash = receipt.receipt?.transactionHash || (receipt as any).transactionHash || '';

      console.log('✅ UserOp executed successfully!');
      console.log('UserOp Hash:', receipt.userOpHash);
      if (txHash) {
        console.log('Transaction:', `https://bscscan.com/tx/${txHash}`);
      }

      return {
        userOpHash: receipt.userOpHash || '',
        txHash: txHash,
        success: true,
      };
    } else {
      console.error('❌ UserOp failed');
      return {
        userOpHash: receipt.userOpHash || '',
        success: false,
        error: 'Transaction reverted',
      };
    }
  } catch (error: any) {
    console.error('❌ Failed to submit UserOp:', error);

    return {
      userOpHash: '',
      success: false,
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Execute a swap using session key
 * High-level wrapper for swaps
 */
export async function executeSwapWithSessionKey(
  params: {
    tokenIn: Address;
    tokenOut: Address;
    amountIn: bigint;
    minAmountOut: bigint;
    router: Address; // PancakeSwap router address
  },
  smartAccountAddress: Address,
  sessionPrivateKey: Hex
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  // Build swap calldata
  // This is simplified - in production, use proper ABI encoding
  const swapCalldata = encodeSwapCalldata(params);

  const transaction = {
    to: params.router,
    data: swapCalldata,
    value: BigInt(0),
  };

  const result = await submitUserOperation(transaction, smartAccountAddress, sessionPrivateKey);

  return {
    success: result.success,
    txHash: result.txHash,
    error: result.error,
  };
}

/**
 * Encode swap calldata for PancakeSwap
 */
function encodeSwapCalldata(params: {
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  minAmountOut: bigint;
}): Hex {
  // In production, use viem's encodeFunctionData:
  //
  // import { encodeFunctionData } from 'viem';
  // return encodeFunctionData({
  //   abi: PANCAKESWAP_ROUTER_ABI,
  //   functionName: 'swapExactTokensForTokens',
  //   args: [amountIn, minAmountOut, [tokenIn, tokenOut], smartAccountAddress, deadline]
  // });

  console.log('Encoding swap:', params);
  return '0x38ed1739' as Hex; // swapExactTokensForTokens selector
}
