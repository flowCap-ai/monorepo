import { createPublicClient, http, formatUnits } from 'viem';
import { bsc } from 'viem/chains';

// Environment variables
const BNB_RPC_URL = process.env.BNB_RPC_URL || 'https://bsc-dataseed1.binance.org';
const DEFILLAMA_API_URL = process.env.DEFILLAMA_API_URL || 'https://yields.llama.fi';

// Venus Protocol ABIs (minimal for APY fetching)
const VENUS_COMPTROLLER_ABI = [
  {
    name: 'getAllMarkets',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address[]' }],
  },
] as const;

const VTOKEN_ABI = [
  {
    name: 'supplyRatePerBlock',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'borrowRatePerBlock',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'underlying',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }],
  },
  {
    name: 'getCash',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'totalBorrows',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const;

// Protocol addresses
const VENUS_COMPTROLLER = process.env.VENUS_COMPTROLLER || '0xfD36E2c2a6789Db23113685031d7F16329158384';

// Known Venus vToken addresses for quick lookup
const VENUS_VTOKENS: Record<string, { address: `0x${string}`; symbol: string; underlying: string }> = {
  vBNB: {
    address: '0xA07c5b74C9B40447a954e1466938b865b6BBea36',
    symbol: 'vBNB',
    underlying: 'BNB',
  },
  vUSDT: {
    address: '0xfD5840Cd36d94D7229439859C0112a4185BC0255',
    symbol: 'vUSDT',
    underlying: 'USDT',
  },
  vUSDC: {
    address: '0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8',
    symbol: 'vUSDC',
    underlying: 'USDC',
  },
  vBUSD: {
    address: '0x95c78222B3D6e262426483D42CfA53685A67Ab9D',
    symbol: 'vBUSD',
    underlying: 'BUSD',
  },
};

export interface YieldData {
  protocol: string;
  pool: string;
  asset: string;
  chain: string;
  apy: number;
  tvl: number;
  apyBase?: number;
  apyReward?: number;
  rewardTokens?: string[];
  riskLevel: 'low' | 'medium' | 'high';
  lastUpdated: Date;
}

export interface ProtocolYields {
  venus: YieldData[];
  pancakeswap: YieldData[];
}

// Create viem client
const client = createPublicClient({
  chain: bsc,
  transport: http(BNB_RPC_URL),
});

// BSC blocks per day (~3 seconds per block)
const BLOCKS_PER_DAY = 28800;
const DAYS_PER_YEAR = 365;
const BLOCKS_PER_YEAR = BLOCKS_PER_DAY * DAYS_PER_YEAR; // 10,512,000

/**
 * Convert rate per block to APY
 * Uses daily compounding which matches Venus UI more closely
 */
function rateToAPY(ratePerBlock: bigint): number {
  // supplyRatePerBlock is scaled by 1e18
  const ratePerBlockNum = Number(ratePerBlock);
  // Daily compound APY: (1 + rate * blocks_per_day)^365 - 1
  const apy = (Math.pow(1 + (ratePerBlockNum / 1e18) * BLOCKS_PER_DAY, DAYS_PER_YEAR) - 1) * 100;
  return Math.round(apy * 100) / 100; // Round to 2 decimal places
}

/**
 * Fetch Venus Protocol yields directly from on-chain smart contracts
 * Returns base supply APY (excludes XVS reward APY)
 */
export async function getVenusYields(): Promise<YieldData[]> {
  const yields: YieldData[] = [];

  for (const [key, vToken] of Object.entries(VENUS_VTOKENS)) {
    try {
      const [supplyRate, totalCash, totalBorrows] = await Promise.all([
        client.readContract({
          address: vToken.address,
          abi: VTOKEN_ABI,
          functionName: 'supplyRatePerBlock',
        }),
        client.readContract({
          address: vToken.address,
          abi: VTOKEN_ABI,
          functionName: 'getCash',
        }),
        client.readContract({
          address: vToken.address,
          abi: VTOKEN_ABI,
          functionName: 'totalBorrows',
        }),
      ]);

      const apy = rateToAPY(supplyRate);

      // TVL = cash + totalBorrows (total supplied to the market)
      const tvl = Number(formatUnits(totalCash + totalBorrows, 18));

      // Calculate utilization rate
      const utilization = tvl > 0 ? Number(formatUnits(totalBorrows, 18)) / tvl : 0;

      yields.push({
        protocol: 'Venus',
        pool: `${vToken.underlying} Supply`,
        asset: vToken.underlying,
        chain: 'BNB Chain',
        apy,
        tvl,
        apyBase: apy,
        riskLevel: vToken.underlying === 'USDT' || vToken.underlying === 'USDC' ? 'low' : 'medium',
        lastUpdated: new Date(),
      });
    } catch (error) {
      console.error(`Error fetching ${key} data:`, error);
    }
  }

  return yields;
}

/**
 * Fetch yields from DeFiLlama API for BNB Chain protocols
 */
export async function getDefiLlamaYields(protocols?: string[]): Promise<YieldData[]> {
  const yields: YieldData[] = [];

  try {
    const response = await fetch(`${DEFILLAMA_API_URL}/pools`);

    if (!response.ok) {
      throw new Error(`DeFiLlama API error: ${response.status}`);
    }

    const data = await response.json() as { data?: any[] };
    const pools = data.data || [];

    // Filter for BNB Chain pools
    const bnbPools = pools.filter((pool: any) => {
      const isBNBChain = pool.chain === 'BSC' || pool.chain === 'Binance';
      const isTargetProtocol = !protocols || protocols.some(p =>
        pool.project.toLowerCase().includes(p.toLowerCase())
      );
      return isBNBChain && isTargetProtocol && pool.apy > 0;
    });

    // Sort by APY descending and take top opportunities
    const sortedPools = bnbPools
      .sort((a: any, b: any) => b.apy - a.apy)
      .slice(0, 50);

    for (const pool of sortedPools) {
      yields.push({
        protocol: pool.project,
        pool: pool.symbol,
        asset: pool.symbol,
        chain: 'BNB Chain',
        apy: Math.round(pool.apy * 100) / 100,
        tvl: pool.tvlUsd || 0,
        apyBase: pool.apyBase || 0,
        apyReward: pool.apyReward || 0,
        rewardTokens: pool.rewardTokens || [],
        riskLevel: getRiskLevel(pool),
        lastUpdated: new Date(),
      });
    }
  } catch (error) {
    console.error('Error fetching DeFiLlama yields:', error);
  }

  return yields;
}

/**
 * Determine risk level based on pool characteristics
 */
function getRiskLevel(pool: any): 'low' | 'medium' | 'high' {
  // Stablecoin pools are low risk
  const stablecoins = ['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD'];
  const isStablecoin = stablecoins.some(s => pool.symbol?.toUpperCase().includes(s));

  // High TVL indicates lower risk
  const isHighTVL = pool.tvlUsd > 10_000_000;

  // Very high APY often indicates higher risk
  const isHighAPY = pool.apy > 50;

  if (isStablecoin && isHighTVL && !isHighAPY) {
    return 'low';
  } else if (isHighAPY || pool.tvlUsd < 1_000_000) {
    return 'high';
  }
  return 'medium';
}

/**
 * Get PancakeSwap specific yields (farms and pools)
 */
export async function getPancakeSwapYields(): Promise<YieldData[]> {
  return getDefiLlamaYields(['pancake']);
}

/**
 * Main function: Get all yields from BNB Chain protocols
 */
export async function getAllYields(): Promise<ProtocolYields> {
  const [venusYields, pancakeYields] = await Promise.all([
    getVenusYields(),
    getPancakeSwapYields(),
  ]);

  return {
    venus: venusYields,
    pancakeswap: pancakeYields,
  };
}

/**
 * Get best yield opportunities based on risk profile
 */
export async function getBestYields(
  riskProfile: 'low' | 'medium' | 'high',
  minAPY: number = 0,
  maxResults: number = 10
): Promise<YieldData[]> {
  const allYields = await getAllYields();
  const combined = [...allYields.venus, ...allYields.pancakeswap];

  // Filter by risk profile
  const riskLevels: Record<string, string[]> = {
    low: ['low'],
    medium: ['low', 'medium'],
    high: ['low', 'medium', 'high'],
  };

  const filtered = combined.filter(y =>
    riskLevels[riskProfile].includes(y.riskLevel) && y.apy >= minAPY
  );

  // Sort by APY descending
  return filtered
    .sort((a, b) => b.apy - a.apy)
    .slice(0, maxResults);
}

/**
 * Compare current position yield vs best available
 */
export async function analyzeYieldOpportunity(
  currentProtocol: string,
  currentAsset: string,
  currentAPY: number,
  riskProfile: 'low' | 'medium' | 'high'
): Promise<{
  shouldReallocate: boolean;
  currentYield: number;
  bestYield: YieldData | null;
  apyDifference: number;
  recommendation: string;
}> {
  const bestYields = await getBestYields(riskProfile, 0, 5);

  // Find best yield for similar asset type
  const bestYield = bestYields.find(y =>
    y.asset.toUpperCase().includes(currentAsset.toUpperCase()) ||
    currentAsset.toUpperCase().includes(y.asset.toUpperCase())
  ) || bestYields[0] || null;

  const apyDifference = bestYield ? bestYield.apy - currentAPY : 0;

  // Minimum 1% APY gain to recommend reallocation (as per process.md)
  const MIN_APY_THRESHOLD = 1;
  const shouldReallocate = apyDifference >= MIN_APY_THRESHOLD;

  let recommendation = '';
  if (!bestYield) {
    recommendation = 'No better yields found matching your risk profile.';
  } else if (shouldReallocate) {
    recommendation = `Consider moving from ${currentProtocol} (${currentAPY}% APY) to ${bestYield.protocol} ${bestYield.pool} (${bestYield.apy}% APY) for +${apyDifference.toFixed(2)}% gain.`;
  } else {
    recommendation = `Current position is optimal. Best alternative offers only +${apyDifference.toFixed(2)}% improvement.`;
  }

  return {
    shouldReallocate,
    currentYield: currentAPY,
    bestYield,
    apyDifference,
    recommendation,
  };
}

// Export for use by the agent
export default {
  getAllYields,
  getVenusYields,
  getPancakeSwapYields,
  getDefiLlamaYields,
  getBestYields,
  analyzeYieldOpportunity,
};
