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

// Token mapping
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

// Create clients
const publicClient = createPublicClient({
  chain: bsc,
  transport: http(BNB_RPC_URL),
});

export interface SwapParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  slippageTolerance: number; // in percentage (e.g., 0.5 for 0.5%)
  recipient: Address;
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
 * Get swap quote from PancakeSwap
 */
export async function getSwapQuote(params: SwapParams): Promise<SwapQuote> {
  const tokenInAddress = TOKEN_ADDRESSES[params.tokenIn.toUpperCase()];
  const tokenOutAddress = TOKEN_ADDRESSES[params.tokenOut.toUpperCase()];

  if (!tokenInAddress || !tokenOutAddress) {
    throw new Error(`Unknown token: ${params.tokenIn} or ${params.tokenOut}`);
  }

  // Get token decimals
  const decimalsIn = params.tokenIn.toUpperCase() === 'BNB' ? 18 : await publicClient.readContract({
    address: tokenInAddress,
    abi: ERC20_ABI,
    functionName: 'decimals',
  });

  const amountInWei = parseUnits(params.amountIn, decimalsIn);

  // Build swap path
  const path: Address[] = tokenInAddress === tokenOutAddress
    ? [tokenInAddress]
    : [tokenInAddress, tokenOutAddress];

  // Get amounts out
  const amounts = await publicClient.readContract({
    address: PANCAKESWAP_ROUTER_V2,
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
    amountOut: formatUnits(amountOut, 18),
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
          '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789', // EntryPoint address
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

// Export for use by the agent
export default {
  getSwapQuote,
  executeSwap,
  supplyToVenus,
  withdrawFromVenus,
  isSwapProfitable,
};
