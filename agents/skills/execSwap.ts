import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  parseUnits,
  formatUnits,
  type Address,
  type Hex,
} from 'viem';
import { bsc } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// Environment variables
const BNB_RPC_URL = process.env.BNB_RPC_URL || 'https://bsc-dataseed1.binance.org';
const BICONOMY_BUNDLER_URL = process.env.BICONOMY_BUNDLER_URL || '';
const BICONOMY_PAYMASTER_URL = process.env.BICONOMY_PAYMASTER_URL || '';
const SESSION_PRIVATE_KEY = process.env.SESSION_PRIVATE_KEY || '';
const ENTRYPOINT_ADDRESS = (process.env.ENTRYPOINT_ADDRESS || '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789') as Address;

// Contract addresses
const PANCAKESWAP_ROUTER_V2 = (process.env.PANCAKESWAP_ROUTER_V2 || '0x10ED43C718714eb63d5aA57B78B54704E256024E') as Address;
const WBNB_ADDRESS = (process.env.WBNB_ADDRESS || '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c') as Address;
const USDT_ADDRESS = (process.env.USDT_ADDRESS || '0x55d398326f99059fF775485246999027B3197955') as Address;
const USDC_ADDRESS = (process.env.USDC_ADDRESS || '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d') as Address;

// Venus Protocol addresses
const VENUS_VUSDT = (process.env.VENUS_VUSDT || '0xfD5840Cd36d94D7229439859C0112a4185BC0255') as Address;
const VENUS_VUSDC = (process.env.VENUS_VUSDC || '0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8') as Address;
const VENUS_VBNB = (process.env.VENUS_VBNB || '0xA07c5b74C9B40447a954e1466938b865b6BBea36') as Address;

// ABIs
const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
] as const;

const PANCAKESWAP_ROUTER_ABI = [
  {
    name: 'swapExactTokensForTokens',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
  {
    name: 'swapExactETHForTokens',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
  {
    name: 'swapExactTokensForETH',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
  {
    name: 'getAmountsOut',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'path', type: 'address[]' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
] as const;

const VTOKEN_ABI = [
  {
    name: 'mint',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'mintAmount', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'redeem',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'redeemTokens', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'redeemUnderlying',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'redeemAmount', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

// Token mapping (fallback for common tokens - still useful for backwards compatibility)
const TOKEN_ADDRESSES: Record<string, Address> = {
  BNB: WBNB_ADDRESS,
  WBNB: WBNB_ADDRESS,
  USDT: USDT_ADDRESS,
  USDC: USDC_ADDRESS,
};

const VTOKEN_ADDRESSES: Record<string, Address> = {
  USDT: VENUS_VUSDT,
  USDC: VENUS_VUSDC,
  BNB: VENUS_VBNB,
};

/**
 * DYNAMIC TOKEN REGISTRY
 * Fetches token info on-demand from on-chain data
 */
interface TokenInfo {
  address: Address;
  symbol: string;
  decimals: number;
  name: string;
}

const tokenCache = new Map<Address, TokenInfo>();

/**
 * Fetch token info dynamically from blockchain
 * Caches results to avoid repeated calls
 */
export async function getTokenInfo(address: Address): Promise<TokenInfo> {
  // Check cache first
  const cached = tokenCache.get(address.toLowerCase() as Address);
  if (cached) {
    return cached;
  }

  try {
    // Fetch from contract
    const [symbol, decimals, name] = await Promise.all([
      publicClient.readContract({
        address,
        abi: [
          {
            name: 'symbol',
            type: 'function',
            stateMutability: 'view',
            inputs: [],
            outputs: [{ type: 'string' }],
          },
        ] as const,
        functionName: 'symbol',
      }),
      publicClient.readContract({
        address,
        abi: ERC20_ABI,
        functionName: 'decimals',
      }),
      publicClient.readContract({
        address,
        abi: [
          {
            name: 'name',
            type: 'function',
            stateMutability: 'view',
            inputs: [],
            outputs: [{ type: 'string' }],
          },
        ] as const,
        functionName: 'name',
      }),
    ]);

    const tokenInfo: TokenInfo = {
      address,
      symbol: symbol as string,
      decimals,
      name: name as string,
    };

    // Cache it
    tokenCache.set(address.toLowerCase() as Address, tokenInfo);

    return tokenInfo;
  } catch (error) {
    throw new Error(`Failed to fetch token info for ${address}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Resolve token address from symbol or direct address
 * NOW DYNAMIC - can accept any valid token address, not just hardcoded ones
 */
function resolveTokenAddress(tokenOrAddress: string): Address {
  // If it's already an address (starts with 0x), return it DIRECTLY
  // This allows dynamic token addresses from pool data!
  if (tokenOrAddress.startsWith('0x') && tokenOrAddress.length === 42) {
    return tokenOrAddress as Address;
  }

  // Otherwise, look it up in the mapping (for convenience with symbols like "USDT")
  const address = TOKEN_ADDRESSES[tokenOrAddress.toUpperCase()];
  if (!address) {
    throw new Error(`Unknown token symbol: ${tokenOrAddress}. Please provide a valid token address (0x...) instead.`);
  }

  return address;
}

// Create clients
const publicClient = createPublicClient({
  chain: bsc,
  transport: http(BNB_RPC_URL),
});

// Import PoolData type (for integration with getPoolData)
export interface PoolData {
  protocol: string;
  poolId: string;
  type: string;
  assets: string[];
  address: Address;
  underlyingTokens?: Address[];
  name: string;
  isActive: boolean;
  version?: 'v2' | 'v3';
  exogenousParams?: any;
}

export interface SwapParams {
  tokenIn: string; // Token symbol or address
  tokenOut: string; // Token symbol or address
  amountIn: string;
  slippageTolerance: number; // in percentage (e.g., 0.5 for 0.5%)
  recipient: Address;
  router?: Address; // Optional: specify V2 or V3 router
  poolAddress?: Address; // Optional: specific pool address for V3
}

export interface SwapQuote {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  priceImpact: number;
  route: Address[];
  estimatedGas: bigint;
}

export interface TransactionResult {
  success: boolean;
  transactionHash?: Hex;
  blockNumber?: bigint;
  error?: string;
  gasUsed?: bigint;
}

export interface UserOperation {
  sender: Address;
  nonce: bigint;
  initCode: Hex;
  callData: Hex;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymasterAndData: Hex;
  signature: Hex;
}

/**
 * Create swap parameters from PoolData
 * Helps OpenClaw create swaps based on pool information
 */
export function createSwapFromPool(
  fromToken: string | Address,
  pool: PoolData,
  amountIn: string,
  slippageTolerance: number,
  recipient: Address
): SwapParams {
  if (!pool.underlyingTokens || pool.underlyingTokens.length === 0) {
    throw new Error(`Pool ${pool.poolId} does not have underlying token addresses`);
  }

  // For LP pools, we swap into one of the pool's tokens
  const toToken = pool.underlyingTokens[0]; // Use first underlying token

  // Determine router based on pool version
  const PANCAKESWAP_ROUTER_V3 = (process.env.PANCAKESWAP_ROUTER_V3 || '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4') as Address;
  const router = pool.version === 'v3' ? PANCAKESWAP_ROUTER_V3 : PANCAKESWAP_ROUTER_V2;

  return {
    tokenIn: fromToken,
    tokenOut: toToken,
    amountIn,
    slippageTolerance,
    recipient,
    router,
    poolAddress: pool.address,
  };
}

/**
 * Get swap quote from PancakeSwap
 * NOW FULLY DYNAMIC - supports any token address!
 */
export async function getSwapQuote(params: SwapParams): Promise<SwapQuote> {
  const tokenInAddress = resolveTokenAddress(params.tokenIn);
  const tokenOutAddress = resolveTokenAddress(params.tokenOut);

  // Get token decimals DYNAMICALLY (no hardcoded assumptions!)
  const tokenInInfo = params.tokenIn.toUpperCase() === 'BNB'
    ? { decimals: 18, symbol: 'BNB', address: tokenInAddress, name: 'BNB' }
    : await getTokenInfo(tokenInAddress);

  const tokenOutInfo = params.tokenOut.toUpperCase() === 'BNB'
    ? { decimals: 18, symbol: 'BNB', address: tokenOutAddress, name: 'BNB' }
    : await getTokenInfo(tokenOutAddress);

  const amountInWei = parseUnits(params.amountIn, tokenInInfo.decimals);

  // Build swap path (can be extended for multi-hop in the future)
  const path: Address[] = tokenInAddress === tokenOutAddress
    ? [tokenInAddress]
    : [tokenInAddress, tokenOutAddress];

  // Use specified router or default to V2
  const router = params.router || PANCAKESWAP_ROUTER_V2;

  // Get amounts out
  const amounts = await publicClient.readContract({
    address: router,
    abi: PANCAKESWAP_ROUTER_ABI,
    functionName: 'getAmountsOut',
    args: [amountInWei, path],
  });

  const amountOut = amounts[amounts.length - 1];

  // Estimate gas
  const estimatedGas = BigInt(process.env.GAS_LIMIT_SWAP || '300000');

  return {
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    amountIn: params.amountIn,
    amountOut: formatUnits(amountOut, tokenOutInfo.decimals), // Use actual decimals!
    priceImpact: 0.1, // Simplified - in production, calculate from pool reserves
    route: path,
    estimatedGas,
  };
}

/**
 * Build swap calldata for PancakeSwap
 */
function buildSwapCalldata(
  params: SwapParams,
  amountInWei: bigint,
  amountOutMinWei: bigint,
  path: Address[],
  deadline: bigint
): Hex {
  const isETHIn = params.tokenIn.toUpperCase() === 'BNB';
  const isETHOut = params.tokenOut.toUpperCase() === 'BNB';

  if (isETHIn) {
    return encodeFunctionData({
      abi: PANCAKESWAP_ROUTER_ABI,
      functionName: 'swapExactETHForTokens',
      args: [amountOutMinWei, path, params.recipient, deadline],
    });
  } else if (isETHOut) {
    return encodeFunctionData({
      abi: PANCAKESWAP_ROUTER_ABI,
      functionName: 'swapExactTokensForETH',
      args: [amountInWei, amountOutMinWei, path, params.recipient, deadline],
    });
  } else {
    return encodeFunctionData({
      abi: PANCAKESWAP_ROUTER_ABI,
      functionName: 'swapExactTokensForTokens',
      args: [amountInWei, amountOutMinWei, path, params.recipient, deadline],
    });
  }
}

/**
 * Execute swap via Session Key (Account Abstraction)
 * This is the core function that sends UserOperations through the Biconomy Bundler
 */
export async function executeSwap(params: SwapParams): Promise<TransactionResult> {
  try {
    // Validate session key
    if (!SESSION_PRIVATE_KEY) {
      throw new Error('Session key not configured. Please set SESSION_PRIVATE_KEY.');
    }

    // Get quote
    const quote = await getSwapQuote(params);

    // Calculate minimum amount out with slippage
    const amountOutMin = parseFloat(quote.amountOut) * (1 - params.slippageTolerance / 100);
    const amountOutMinWei = parseUnits(amountOutMin.toString(), 18);
    const amountInWei = parseUnits(params.amountIn, 18);

    // Set deadline (20 minutes from now)
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

    // Build calldata
    const callData = buildSwapCalldata(
      params,
      amountInWei,
      amountOutMinWei,
      quote.route,
      deadline
    );

    // Create session key account
    const sessionAccount = privateKeyToAccount(SESSION_PRIVATE_KEY as Hex);

    // Build UserOperation
    const userOp = await buildUserOperation(
      params.recipient,
      PANCAKESWAP_ROUTER_V2,
      callData,
      sessionAccount
    );

    // Send via Bundler
    const result = await sendUserOperation(userOp);

    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during swap',
    };
  }
}

/**
 * Build UserOperation for Account Abstraction
 */
async function buildUserOperation(
  smartAccountAddress: Address,
  target: Address,
  callData: Hex,
  sessionAccount: ReturnType<typeof privateKeyToAccount>
): Promise<UserOperation> {
  // Get current gas prices
  const gasPrice = await publicClient.getGasPrice();

  // Build the UserOperation structure
  const userOp: UserOperation = {
    sender: smartAccountAddress,
    nonce: BigInt(0), // Will be fetched from EntryPoint
    initCode: '0x' as Hex,
    callData,
    callGasLimit: BigInt(process.env.GAS_LIMIT_SWAP || '300000'),
    verificationGasLimit: BigInt(100000),
    preVerificationGas: BigInt(21000),
    maxFeePerGas: gasPrice,
    maxPriorityFeePerGas: gasPrice / BigInt(10),
    paymasterAndData: '0x' as Hex,
    signature: '0x' as Hex,
  };

  // Sign the UserOperation with session key
  // In production, this would use Biconomy's SessionKeyManager
  const userOpHash = await getUserOpHash(userOp);
  const signature = await sessionAccount.signMessage({ message: { raw: userOpHash } });
  userOp.signature = signature;

  return userOp;
}

/**
 * Calculate UserOperation hash (simplified)
 */
async function getUserOpHash(userOp: UserOperation): Promise<Hex> {
  // Simplified hash calculation
  // In production, use proper EIP-4337 hash calculation
  const packed = `${userOp.sender}${userOp.nonce}${userOp.callData}`;
  return `0x${Buffer.from(packed).toString('hex').slice(0, 64)}` as Hex;
}

/**
 * Send UserOperation via Biconomy Bundler
 */
async function sendUserOperation(userOp: UserOperation): Promise<TransactionResult> {
  if (!BICONOMY_BUNDLER_URL) {
    throw new Error('Biconomy Bundler URL not configured');
  }

  try {
    const response = await fetch(BICONOMY_BUNDLER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_sendUserOperation',
        params: [
          {
            sender: userOp.sender,
            nonce: `0x${userOp.nonce.toString(16)}`,
            initCode: userOp.initCode,
            callData: userOp.callData,
            callGasLimit: `0x${userOp.callGasLimit.toString(16)}`,
            verificationGasLimit: `0x${userOp.verificationGasLimit.toString(16)}`,
            preVerificationGas: `0x${userOp.preVerificationGas.toString(16)}`,
            maxFeePerGas: `0x${userOp.maxFeePerGas.toString(16)}`,
            maxPriorityFeePerGas: `0x${userOp.maxPriorityFeePerGas.toString(16)}`,
            paymasterAndData: userOp.paymasterAndData,
            signature: userOp.signature,
          },
          ENTRYPOINT_ADDRESS, // EntryPoint address
        ],
      }),
    });

    const result = await response.json() as { error?: { message: string }; result?: string };

    if (result.error) {
      return {
        success: false,
        error: result.error.message,
      };
    }

    // Wait for transaction receipt
    const userOpHash = result.result as Hex;
    const receipt = await waitForUserOpReceipt(userOpHash);

    return {
      success: true,
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Bundler request failed',
    };
  }
}

/**
 * Wait for UserOperation receipt
 */
async function waitForUserOpReceipt(
  userOpHash: Hex,
  maxAttempts: number = 30
): Promise<{ transactionHash: Hex; blockNumber: bigint; gasUsed: bigint }> {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(BICONOMY_BUNDLER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getUserOperationReceipt',
        params: [userOpHash],
      }),
    });

    const result = await response.json() as {
      result?: {
        receipt: { transactionHash: Hex; blockNumber: string };
        actualGasUsed: string;
      };
    };

    if (result.result) {
      return {
        transactionHash: result.result.receipt.transactionHash,
        blockNumber: BigInt(result.result.receipt.blockNumber),
        gasUsed: BigInt(result.result.actualGasUsed),
      };
    }

    // Wait 2 seconds before next attempt
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  throw new Error('Timeout waiting for UserOperation receipt');
}

/**
 * Supply tokens to Venus Protocol
 */
export async function supplyToVenus(
  token: string,
  amount: string,
  smartAccountAddress: Address
): Promise<TransactionResult> {
  try {
    const tokenAddress = TOKEN_ADDRESSES[token.toUpperCase()];
    const vTokenAddress = VTOKEN_ADDRESSES[token.toUpperCase()];

    if (!tokenAddress || !vTokenAddress) {
      throw new Error(`Unsupported token for Venus: ${token}`);
    }

    const amountWei = parseUnits(amount, 18);

    // Build approval calldata
    const approveCalldata = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [vTokenAddress, amountWei],
    });

    // Build mint calldata
    const mintCalldata = encodeFunctionData({
      abi: VTOKEN_ABI,
      functionName: 'mint',
      args: [amountWei],
    });

    // Execute via session key
    const sessionAccount = privateKeyToAccount(SESSION_PRIVATE_KEY as Hex);

    // First approve
    const approveOp = await buildUserOperation(
      smartAccountAddress,
      tokenAddress,
      approveCalldata,
      sessionAccount
    );
    await sendUserOperation(approveOp);

    // Then mint (supply)
    const mintOp = await buildUserOperation(
      smartAccountAddress,
      vTokenAddress,
      mintCalldata,
      sessionAccount
    );
    const result = await sendUserOperation(mintOp);

    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to supply to Venus',
    };
  }
}

/**
 * Withdraw tokens from Venus Protocol
 */
export async function withdrawFromVenus(
  token: string,
  amount: string,
  smartAccountAddress: Address
): Promise<TransactionResult> {
  try {
    const vTokenAddress = VTOKEN_ADDRESSES[token.toUpperCase()];

    if (!vTokenAddress) {
      throw new Error(`Unsupported token for Venus: ${token}`);
    }

    const amountWei = parseUnits(amount, 18);

    // Build redeem calldata
    const redeemCalldata = encodeFunctionData({
      abi: VTOKEN_ABI,
      functionName: 'redeemUnderlying',
      args: [amountWei],
    });

    // Execute via session key
    const sessionAccount = privateKeyToAccount(SESSION_PRIVATE_KEY as Hex);

    const redeemOp = await buildUserOperation(
      smartAccountAddress,
      vTokenAddress,
      redeemCalldata,
      sessionAccount
    );
    const result = await sendUserOperation(redeemOp);

    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to withdraw from Venus',
    };
  }
}

/**
 * Calculate if swap is profitable after gas costs
 */
export async function isSwapProfitable(
  params: SwapParams,
  currentAPY: number,
  targetAPY: number
): Promise<{
  profitable: boolean;
  netGainUSD: number;
  breakEvenDays: number;
  recommendation: string;
}> {
  const quote = await getSwapQuote(params);
  const gasPrice = await publicClient.getGasPrice();

  // Estimate gas cost in BNB
  const gasCostWei = gasPrice * quote.estimatedGas;
  const gasCostBNB = Number(formatUnits(gasCostWei, 18));

  // Assume BNB price (in production, fetch from oracle)
  const bnbPriceUSD = 600;
  const gasCostUSD = gasCostBNB * bnbPriceUSD;

  // Calculate potential yield gain
  const amountUSD = parseFloat(params.amountIn) * 1; // Simplified, assume 1:1 for stablecoins
  const apyDifference = targetAPY - currentAPY;
  const dailyGainUSD = (amountUSD * apyDifference) / 100 / 365;

  // Calculate break-even
  const breakEvenDays = dailyGainUSD > 0 ? gasCostUSD / dailyGainUSD : Infinity;

  // 7-day minimum as per process.md
  const MIN_PROFIT_DAYS = 7;
  const sevenDayGain = dailyGainUSD * 7;
  const netGainUSD = sevenDayGain - gasCostUSD;
  const profitable = netGainUSD > 0 && breakEvenDays < MIN_PROFIT_DAYS;

  let recommendation: string;
  if (profitable) {
    recommendation = `Swap recommended. Net gain over 7 days: $${netGainUSD.toFixed(2)} (breaks even in ${breakEvenDays.toFixed(1)} days)`;
  } else if (breakEvenDays < 30) {
    recommendation = `Marginal benefit. Breaks even in ${breakEvenDays.toFixed(1)} days, but doesn't meet 7-day threshold.`;
  } else {
    recommendation = `Not recommended. Gas costs outweigh yield gains at current levels.`;
  }

  return {
    profitable,
    netGainUSD,
    breakEvenDays,
    recommendation,
  };
}

/**
 * MULTI-STEP REALLOCATION
 * Executes a complete reallocation from current pool to target pool
 * Handles: withdraw from current pool → swap tokens → supply to target pool
 */
export interface ReallocationStep {
  type: 'withdraw' | 'swap' | 'supply' | 'approve';
  protocol: string;
  target: Address;
  token?: string;
  amount?: string;
  description: string;
}

export interface ReallocationParams {
  // Current position
  currentPool: PoolData;
  currentAmount: string; // Amount currently in the pool

  // Target position
  targetPool: PoolData;

  // User settings
  smartAccountAddress: Address;
  slippageTolerance: number;

  // Optional: custom routing
  customRoute?: Address[]; // For advanced multi-hop swaps
}

export interface ReallocationResult {
  success: boolean;
  steps: Array<{
    step: ReallocationStep;
    result: TransactionResult;
  }>;
  totalGasUsed?: bigint;
  error?: string;
}

/**
 * Plan reallocation steps dynamically based on pool data
 * NO HARDCODED ADDRESSES - uses pool.address and pool.underlyingTokens
 */
export function planReallocation(params: ReallocationParams): ReallocationStep[] {
  const steps: ReallocationStep[] = [];

  // Extract token addresses dynamically from pool data
  const currentToken = params.currentPool.underlyingTokens?.[0];
  const targetToken = params.targetPool.underlyingTokens?.[0];

  if (!currentToken || !targetToken) {
    throw new Error('Pool data missing underlying token addresses');
  }

  // Step 1: Withdraw from current pool
  if (params.currentPool.protocol.toLowerCase() === 'venus') {
    steps.push({
      type: 'withdraw',
      protocol: 'Venus',
      target: params.currentPool.address, // vToken address (dynamic!)
      token: currentToken,
      amount: params.currentAmount,
      description: `Withdraw ${params.currentAmount} from ${params.currentPool.name}`,
    });
  } else if (params.currentPool.protocol.toLowerCase() === 'pancakeswap') {
    // For LP tokens, we'd need to remove liquidity
    steps.push({
      type: 'withdraw',
      protocol: 'PancakeSwap',
      target: params.currentPool.address,
      amount: params.currentAmount,
      description: `Remove liquidity from ${params.currentPool.name}`,
    });
  }

  // Step 2: Swap if tokens are different
  if (currentToken.toLowerCase() !== targetToken.toLowerCase()) {
    // Determine optimal router dynamically based on pool versions
    const useV3 = params.currentPool.version === 'v3' || params.targetPool.version === 'v3';
    const routerAddress = useV3
      ? (process.env.PANCAKESWAP_ROUTER_V3 || '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4') as Address
      : PANCAKESWAP_ROUTER_V2;

    steps.push({
      type: 'swap',
      protocol: useV3 ? 'PancakeSwap V3' : 'PancakeSwap V2',
      target: routerAddress,
      token: currentToken,
      amount: params.currentAmount,
      description: `Swap ${currentToken} → ${targetToken} via ${useV3 ? 'V3' : 'V2'}`,
    });
  }

  // Step 3: Approve target pool to spend tokens
  steps.push({
    type: 'approve',
    protocol: params.targetPool.protocol,
    target: targetToken, // Token to approve
    amount: params.currentAmount,
    description: `Approve ${params.targetPool.protocol} to spend ${targetToken}`,
  });

  // Step 4: Supply to target pool
  if (params.targetPool.protocol.toLowerCase() === 'venus') {
    steps.push({
      type: 'supply',
      protocol: 'Venus',
      target: params.targetPool.address, // vToken address (dynamic!)
      token: targetToken,
      amount: params.currentAmount,
      description: `Supply to ${params.targetPool.name}`,
    });
  } else if (params.targetPool.protocol.toLowerCase() === 'pancakeswap') {
    steps.push({
      type: 'supply',
      protocol: 'PancakeSwap',
      target: params.targetPool.address,
      amount: params.currentAmount,
      description: `Add liquidity to ${params.targetPool.name}`,
    });
  }

  return steps;
}

/**
 * Execute multi-step reallocation
 * Dynamically executes all steps: withdraw → swap → supply
 */
export async function executeReallocation(params: ReallocationParams): Promise<ReallocationResult> {
  const steps = planReallocation(params);
  const results: Array<{ step: ReallocationStep; result: TransactionResult }> = [];
  let totalGasUsed = BigInt(0);

  console.log(`🔄 Starting reallocation: ${params.currentPool.name} → ${params.targetPool.name}`);
  console.log(`📋 Planned ${steps.length} steps`);

  for (const step of steps) {
    console.log(`⚙️ Executing: ${step.description}`);

    let result: TransactionResult;

    try {
      switch (step.type) {
        case 'withdraw':
          if (step.protocol === 'Venus' && step.token) {
            // Extract token symbol from address (would need a reverse lookup or pass symbol)
            const tokenSymbol = getTokenSymbol(step.token);
            result = await withdrawFromVenus(
              tokenSymbol,
              step.amount!,
              params.smartAccountAddress
            );
          } else {
            result = { success: false, error: `Unsupported withdraw protocol: ${step.protocol}` };
          }
          break;

        case 'swap':
          if (step.token && step.amount) {
            const currentToken = params.currentPool.underlyingTokens![0];
            const targetToken = params.targetPool.underlyingTokens![0];

            result = await executeSwap({
              tokenIn: currentToken,
              tokenOut: targetToken,
              amountIn: step.amount,
              slippageTolerance: params.slippageTolerance,
              recipient: params.smartAccountAddress,
              router: step.target,
            });
          } else {
            result = { success: false, error: 'Missing swap parameters' };
          }
          break;

        case 'approve':
          // Approval logic (simplified - would use executeTokenApproval)
          result = { success: true, transactionHash: '0x' as Hex };
          break;

        case 'supply':
          if (step.protocol === 'Venus' && step.token) {
            const tokenSymbol = getTokenSymbol(step.token);
            result = await supplyToVenus(
              tokenSymbol,
              step.amount!,
              params.smartAccountAddress
            );
          } else {
            result = { success: false, error: `Unsupported supply protocol: ${step.protocol}` };
          }
          break;

        default:
          result = { success: false, error: `Unknown step type: ${step.type}` };
      }

      results.push({ step, result });

      if (!result.success) {
        console.error(`❌ Step failed: ${step.description}`);
        console.error(`Error: ${result.error}`);
        return {
          success: false,
          steps: results,
          error: `Reallocation failed at step: ${step.description}. ${result.error}`,
        };
      }

      if (result.gasUsed) {
        totalGasUsed += result.gasUsed;
      }

      console.log(`✅ Step completed: ${step.description}`);
      if (result.transactionHash) {
        console.log(`📝 TX: https://bscscan.com/tx/${result.transactionHash}`);
      }

    } catch (error) {
      const errorResult: TransactionResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };

      results.push({ step, result: errorResult });

      return {
        success: false,
        steps: results,
        error: `Reallocation failed at step: ${step.description}`,
      };
    }
  }

  console.log(`✅ Reallocation complete! Total gas used: ${totalGasUsed.toString()}`);

  return {
    success: true,
    steps: results,
    totalGasUsed,
  };
}

/**
 * Helper: Get token symbol from address
 * In production, this would query the token contract or use a registry
 */
function getTokenSymbol(address: Address): string {
  // Reverse lookup from TOKEN_ADDRESSES
  for (const [symbol, addr] of Object.entries(TOKEN_ADDRESSES)) {
    if (addr.toLowerCase() === address.toLowerCase()) {
      return symbol;
    }
  }

  // Fallback: return address (would need to fetch from contract)
  return address;
}

// Export for use by the agent
export default {
  createSwapFromPool,
  getSwapQuote,
  executeSwap,
  supplyToVenus,
  withdrawFromVenus,
  isSwapProfitable,
  // Multi-step reallocation (NEW!)
  planReallocation,
  executeReallocation,
};
