/**
 * analyzePool.ts - Analyze a specific pool for yield and risk
 * Dynamic skill that takes a pool ID and returns comprehensive analysis
 */

import { createPublicClient, http, formatUnits, type Address } from 'viem';
import { bsc } from 'viem/chains';

const BNB_RPC_URL = process.env.BNB_RPC_URL || 'https://1rpc.io/bnb';
const DEFILLAMA_API_URL = 'https://yields.llama.fi';

const client = createPublicClient({
  chain: bsc,
  transport: http(BNB_RPC_URL),
});

// Venus vToken ABI
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
    name: 'totalBorrows',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'getCash',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'totalSupply',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'exchangeRateStored',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const;

// BSC constants (measured from actual block production)
// BSC produces ~149 blocks per minute = 214,560 blocks per day (~0.4 sec/block)
const BLOCKS_PER_DAY = 214560;
const DAYS_PER_YEAR = 365;

export interface PoolAnalysis {
  poolId: string;
  protocol: 'venus' | 'pancakeswap' | 'lista-lending' | 'lista-staking' | 'alpaca';
  assets: string[];

  // Yield data
  apy: number;
  apyBase: number;
  apyReward: number;
  rewardTokens: string[];

  // Risk data
  tvl: number;
  utilizationRate: number;
  riskScore: number; // 0-100, higher is safer
  riskLevel: 'low' | 'medium' | 'high' | 'critical';

  // Market conditions
  liquidity: number;
  volume24h?: number;

  // Metadata
  warnings: string[];
  lastUpdated: Date;
}

/**
 * Calculate APY from Venus supplyRatePerBlock
 * Formula from Venus docs (with correction): APY = ((Rate/1e18 * BlocksPerDay + 1)^365 - 1) * 100
 */
function calculateVenusAPY(supplyRatePerBlock: bigint): number {
  const ratePerBlockNum = Number(supplyRatePerBlock);
  const mantissa = 1e18;

  // Daily rate = rate per block * blocks per day
  const dailyRate = (ratePerBlockNum / mantissa) * BLOCKS_PER_DAY;

  // APY with daily compounding
  const apy = (Math.pow(1 + dailyRate, DAYS_PER_YEAR) - 1) * 100;

  return Math.round(apy * 10000) / 10000; // Round to 4 decimal places for precision
}

/**
 * Calculate risk score based on protocol characteristics
 */
function calculateRiskScore(data: {
  protocol: string;
  tvl: number;
  utilizationRate: number;
  isStablecoin: boolean;
  daysActive: number;
}): { score: number; level: 'low' | 'medium' | 'high' | 'critical'; warnings: string[] } {
  const warnings: string[] = [];
  let score = 100;

  // TVL risk
  if (data.tvl < 1_000_000) {
    score -= 30;
    warnings.push('Low TVL - potential liquidity risk');
  } else if (data.tvl < 10_000_000) {
    score -= 15;
  }

  // Utilization risk (for lending)
  if (data.protocol === 'venus') {
    if (data.utilizationRate > 0.95) {
      score -= 30;
      warnings.push('Critical utilization - withdrawal delays possible');
    } else if (data.utilizationRate > 0.85) {
      score -= 15;
      warnings.push('High utilization rate');
    }
  }

  // Stablecoin bonus
  if (data.isStablecoin) {
    score += 10;
  }

  // Protocol maturity
  if (data.daysActive < 30) {
    score -= 25;
    warnings.push('Very new protocol');
  } else if (data.daysActive < 90) {
    score -= 10;
  }

  score = Math.max(0, Math.min(100, score));

  let level: 'low' | 'medium' | 'high' | 'critical';
  if (score >= 75) level = 'low';
  else if (score >= 50) level = 'medium';
  else if (score >= 25) level = 'high';
  else level = 'critical';

  return { score, level, warnings };
}

/**
 * Analyze Venus lending pool
 */
export async function analyzeVenusPool(poolId: string, vTokenAddress: Address): Promise<PoolAnalysis> {
  const [supplyRate, borrowRate, totalBorrows, cash, totalSupply, exchangeRate] = await Promise.all([
    client.readContract({
      address: vTokenAddress,
      abi: VTOKEN_ABI,
      functionName: 'supplyRatePerBlock',
    }),
    client.readContract({
      address: vTokenAddress,
      abi: VTOKEN_ABI,
      functionName: 'borrowRatePerBlock',
    }),
    client.readContract({
      address: vTokenAddress,
      abi: VTOKEN_ABI,
      functionName: 'totalBorrows',
    }),
    client.readContract({
      address: vTokenAddress,
      abi: VTOKEN_ABI,
      functionName: 'getCash',
    }),
    client.readContract({
      address: vTokenAddress,
      abi: VTOKEN_ABI,
      functionName: 'totalSupply',
    }),
    client.readContract({
      address: vTokenAddress,
      abi: VTOKEN_ABI,
      functionName: 'exchangeRateStored',
    }),
  ]);

  // Calculate metrics
  const supplyAPY = calculateVenusAPY(supplyRate);
  const tvl = Number(formatUnits(cash + totalBorrows, 18));
  const utilizationRate = tvl > 0 ? Number(formatUnits(totalBorrows, 18)) / tvl : 0;
  const liquidity = Number(formatUnits(cash, 18));

  // Parse asset from poolId (e.g., "venus-usdt" -> "USDT")
  const asset = poolId.replace('venus-', '').toUpperCase();
  const isStablecoin = ['USDT', 'USDC', 'BUSD', 'DAI'].includes(asset);

  // Calculate risk
  const risk = calculateRiskScore({
    protocol: 'venus',
    tvl,
    utilizationRate,
    isStablecoin,
    daysActive: 1500, // Venus launched ~4 years ago
  });

  return {
    poolId,
    protocol: 'venus',
    assets: [asset],
    apy: supplyAPY,
    apyBase: supplyAPY,
    apyReward: 0, // XVS rewards not included (base rate only)
    rewardTokens: [],
    tvl,
    utilizationRate,
    riskScore: risk.score,
    riskLevel: risk.level,
    liquidity,
    warnings: risk.warnings,
    lastUpdated: new Date(),
  };
}

/**
 * Analyze PancakeSwap pool from DeFiLlama
 */
export async function analyzePancakeSwapPool(poolId: string): Promise<PoolAnalysis> {
  try {
    const response = await fetch(`${DEFILLAMA_API_URL}/pools`);
    if (!response.ok) {
      throw new Error('Failed to fetch pool data');
    }

    const data = await response.json() as { data?: any[] };
    const pools = data.data || [];

    // Find the specific pool
    const pool = pools.find((p: any) => `pancakeswap-${p.pool}` === poolId);

    if (!pool) {
      throw new Error(`Pool ${poolId} not found`);
    }

    // Parse assets from symbol
    const assets = pool.symbol?.split('-').map((s: string) => s.trim()) || [];
    const isStablecoin = assets.every((a: string) =>
      ['USDT', 'USDC', 'BUSD', 'DAI'].includes(a.toUpperCase())
    );

    // DeFiLlama provides APY (not APR), so we use it directly
    const totalAPY = pool.apy || 0;
    const baseAPY = pool.apyBase || 0;
    const rewardAPY = pool.apyReward || 0;

    // Calculate risk
    const risk = calculateRiskScore({
      protocol: 'pancakeswap',
      tvl: pool.tvlUsd || 0,
      utilizationRate: 0, // N/A for AMM pools
      isStablecoin,
      daysActive: 1400, // PancakeSwap launched ~3.8 years ago
    });

    // Additional warnings for LP farms
    if (rewardAPY > 50) {
      risk.warnings.push('Very high reward APY - potential impermanent loss risk');
    }
    if (pool.ilRisk === 'high') {
      risk.warnings.push('High impermanent loss risk');
    }

    return {
      poolId,
      protocol: 'pancakeswap',
      assets,
      apy: totalAPY,
      apyBase: baseAPY,
      apyReward: rewardAPY,
      rewardTokens: pool.rewardTokens || ['CAKE'],
      tvl: pool.tvlUsd || 0,
      utilizationRate: 0,
      riskScore: risk.score,
      riskLevel: risk.level,
      liquidity: pool.tvlUsd || 0,
      volume24h: pool.volumeUsd1d,
      warnings: risk.warnings,
      lastUpdated: new Date(),
    };
  } catch (error) {
    throw new Error(`Failed to analyze pool: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Analyze Lista DAO pool from DeFiLlama (lending or liquid staking)
 */
export async function analyzeListaPool(poolId: string): Promise<PoolAnalysis> {
  try {
    const response = await fetch(`${DEFILLAMA_API_URL}/pools`);
    if (!response.ok) {
      throw new Error('Failed to fetch pool data');
    }

    const data = await response.json() as { data?: any[] };
    const pools = data.data || [];

    // Find the specific pool (matches both lista-lending and lista-liquid-staking)
    const pool = pools.find((p: any) =>
      poolId === `lista-lending-${p.pool}` || poolId === `lista-liquid-staking-${p.pool}`
    );

    if (!pool) {
      throw new Error(`Pool ${poolId} not found`);
    }

    const isStaking = pool.project === 'lista-liquid-staking';
    const protocol = isStaking ? 'lista-staking' : 'lista-lending';

    // Parse assets from symbol
    const assets = pool.symbol?.split('-').map((s: string) => s.trim()) || [pool.symbol || 'Unknown'];
    const isStablecoin = assets.every((a: string) =>
      ['USDT', 'USDC', 'BUSD', 'DAI', 'USD1'].includes(a.toUpperCase())
    );

    const totalAPY = pool.apy || 0;
    const baseAPY = pool.apyBase || 0;
    const rewardAPY = pool.apyReward || 0;

    // Calculate risk
    const risk = calculateRiskScore({
      protocol: pool.project,
      tvl: pool.tvlUsd || 0,
      utilizationRate: 0, // Not provided by DeFiLlama for Lista
      isStablecoin,
      daysActive: 365, // Lista launched ~1 year ago
    });

    // Additional warnings
    if (isStaking && rewardAPY > 10) {
      risk.warnings.push('Liquid staking - consider protocol risks');
    }

    return {
      poolId,
      protocol,
      assets,
      apy: totalAPY,
      apyBase: baseAPY,
      apyReward: rewardAPY,
      rewardTokens: pool.rewardTokens || ['LISTA'],
      tvl: pool.tvlUsd || 0,
      utilizationRate: 0,
      riskScore: risk.score,
      riskLevel: risk.level,
      liquidity: pool.tvlUsd || 0,
      volume24h: pool.volumeUsd1d,
      warnings: risk.warnings,
      lastUpdated: new Date(),
    };
  } catch (error) {
    throw new Error(`Failed to analyze pool: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Analyze Alpaca Finance pool from DeFiLlama (leveraged yield farming)
 */
export async function analyzeAlpacaPool(poolId: string): Promise<PoolAnalysis> {
  try {
    const response = await fetch(`${DEFILLAMA_API_URL}/pools`);
    if (!response.ok) {
      throw new Error('Failed to fetch pool data');
    }

    const data = await response.json() as { data?: any[] };
    const pools = data.data || [];

    // Find the specific pool
    const pool = pools.find((p: any) => `alpaca-${p.pool}` === poolId);

    if (!pool) {
      throw new Error(`Pool ${poolId} not found`);
    }

    // Parse assets from symbol
    const assets = pool.symbol?.split('-').map((s: string) => s.trim()) || [pool.symbol || 'Unknown'];
    const isStablecoin = assets.every((a: string) =>
      ['USDT', 'USDC', 'BUSD', 'DAI'].includes(a.toUpperCase())
    );

    const totalAPY = pool.apy || 0;
    const baseAPY = pool.apyBase || 0;
    const rewardAPY = pool.apyReward || 0;

    // Calculate risk - Alpaca has higher base risk due to leverage
    const risk = calculateRiskScore({
      protocol: 'alpaca-finance',
      tvl: pool.tvlUsd || 0,
      utilizationRate: 0,
      isStablecoin,
      daysActive: 1300, // Alpaca launched ~3.5 years ago
    });

    // Additional warnings for leveraged farming
    risk.warnings.push('Leveraged yield farming - higher risk of liquidation');
    if (rewardAPY > 30) {
      risk.warnings.push('Very high APY - potential impermanent loss and liquidation risk');
    }

    // Reduce risk score for leveraged products
    risk.score = Math.max(0, risk.score - 15);
    if (risk.score < 75 && risk.level === 'low') risk.level = 'medium';
    if (risk.score < 50 && risk.level === 'medium') risk.level = 'high';

    return {
      poolId,
      protocol: 'alpaca',
      assets,
      apy: totalAPY,
      apyBase: baseAPY,
      apyReward: rewardAPY,
      rewardTokens: pool.rewardTokens || ['ALPACA'],
      tvl: pool.tvlUsd || 0,
      utilizationRate: 0,
      riskScore: risk.score,
      riskLevel: risk.level,
      liquidity: pool.tvlUsd || 0,
      volume24h: pool.volumeUsd1d,
      warnings: risk.warnings,
      lastUpdated: new Date(),
    };
  } catch (error) {
    throw new Error(`Failed to analyze pool: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generic analyzer using DeFiLlama data for any pool
 * Fallback method when protocol-specific analyzer is not available
 */
export async function analyzePoolGeneric(poolId: string, projectName?: string): Promise<PoolAnalysis> {
  try {
    const response = await fetch(`${DEFILLAMA_API_URL}/pools`);
    if (!response.ok) {
      throw new Error('Failed to fetch pool data from DeFiLlama');
    }

    const data = await response.json() as { data?: any[] };
    const pools = data.data || [];

    // Find the specific pool - try multiple matching strategies
    let pool = pools.find((p: any) => poolId.includes(p.pool));

    if (!pool && projectName) {
      // Try finding by project name if poolId doesn't match
      pool = pools.find((p: any) => p.project === projectName && poolId.includes(p.pool));
    }

    if (!pool) {
      throw new Error(`Pool ${poolId} not found in DeFiLlama`);
    }

    // Parse assets from symbol
    const assets = pool.symbol?.split('-').map((s: string) => s.trim()) || [pool.symbol || 'Unknown'];
    const isStablecoin = assets.every((a: string) =>
      ['USDT', 'USDC', 'BUSD', 'DAI', 'USD1'].includes(a.toUpperCase())
    );

    const totalAPY = pool.apy || 0;
    const baseAPY = pool.apyBase || 0;
    const rewardAPY = pool.apyReward || 0;

    // Determine protocol type from project name
    let protocol: PoolAnalysis['protocol'] = 'pancakeswap'; // Default
    if (pool.project?.includes('venus')) protocol = 'venus';
    else if (pool.project?.includes('lista-lending')) protocol = 'lista-lending';
    else if (pool.project?.includes('lista')) protocol = 'lista-staking';
    else if (pool.project?.includes('alpaca')) protocol = 'alpaca';

    // Calculate risk based on available data
    const risk = calculateRiskScore({
      protocol: pool.project || 'unknown',
      tvl: pool.tvlUsd || 0,
      utilizationRate: 0, // Not available in generic case
      isStablecoin,
      daysActive: 365, // Assume mature if we don't know
    });

    // Add warnings based on pool characteristics
    if (rewardAPY > 50) {
      risk.warnings.push('Very high reward APY - verify sustainability');
    }
    if (pool.ilRisk === 'high') {
      risk.warnings.push('High impermanent loss risk');
    }
    if (pool.tvlUsd < 100000) {
      risk.warnings.push('Low TVL - potential liquidity risk');
    }

    return {
      poolId,
      protocol,
      assets,
      apy: totalAPY,
      apyBase: baseAPY,
      apyReward: rewardAPY,
      rewardTokens: pool.rewardTokens || [],
      tvl: pool.tvlUsd || 0,
      utilizationRate: 0,
      riskScore: risk.score,
      riskLevel: risk.level,
      liquidity: pool.tvlUsd || 0,
      volume24h: pool.volumeUsd1d,
      warnings: risk.warnings,
      lastUpdated: new Date(),
    };
  } catch (error) {
    throw new Error(`Failed to analyze pool generically: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Main function: Analyze any pool dynamically
 */
export async function analyzePool(poolId: string, poolAddress?: Address): Promise<PoolAnalysis> {
  // Determine protocol from poolId and use appropriate analyzer
  try {
    if (poolId.startsWith('venus-')) {
      if (!poolAddress) {
        // Try generic DeFiLlama fallback if no address provided
        return analyzePoolGeneric(poolId, 'venus-core-pool');
      }
      return analyzeVenusPool(poolId, poolAddress);
    } else if (poolId.startsWith('pancakeswap-')) {
      return analyzePancakeSwapPool(poolId);
    } else if (poolId.startsWith('lista-lending-')) {
      return analyzeListaPool(poolId);
    } else if (poolId.startsWith('lista-liquid-staking-')) {
      return analyzeListaPool(poolId);
    } else if (poolId.startsWith('lista-cdp-')) {
      // lista-cdp doesn't have specific analyzer yet, use generic
      return analyzePoolGeneric(poolId, 'lista-cdp');
    } else if (poolId.startsWith('alpaca-')) {
      return analyzeAlpacaPool(poolId);
    } else {
      // Unknown pool type - try generic analyzer
      return analyzePoolGeneric(poolId);
    }
  } catch (error) {
    // If specific analyzer fails, try generic fallback
    console.warn(`Specific analyzer failed for ${poolId}, trying generic analyzer`);
    return analyzePoolGeneric(poolId);
  }
}

/**
 * Compare two pools side-by-side
 */
export async function comparePools(
  pool1Id: string,
  pool1Address: Address | undefined,
  pool2Id: string,
  pool2Address: Address | undefined
): Promise<{
  pool1: PoolAnalysis;
  pool2: PoolAnalysis;
  recommendation: string;
  apyDifference: number;
  riskDifference: number;
}> {
  const [pool1, pool2] = await Promise.all([
    analyzePool(pool1Id, pool1Address),
    analyzePool(pool2Id, pool2Address),
  ]);

  const apyDifference = pool2.apy - pool1.apy;
  const riskDifference = pool1.riskScore - pool2.riskScore; // Positive = pool1 is safer

  let recommendation: string;
  if (apyDifference > 1 && riskDifference < 20) {
    recommendation = `Switch to ${pool2.poolId}: +${apyDifference.toFixed(2)}% APY with similar risk`;
  } else if (apyDifference > 5 && riskDifference < 40) {
    recommendation = `Consider ${pool2.poolId}: +${apyDifference.toFixed(2)}% APY (slightly higher risk)`;
  } else if (riskDifference > 20) {
    recommendation = `Stay in ${pool1.poolId}: safer by ${riskDifference} points`;
  } else {
    recommendation = `Pools are similar: ${pool1.poolId} (safer) vs ${pool2.poolId} (+${apyDifference.toFixed(2)}% APY)`;
  }

  return {
    pool1,
    pool2,
    recommendation,
    apyDifference,
    riskDifference,
  };
}

export default {
  analyzePool,
  analyzePoolGeneric,
  analyzeVenusPool,
  analyzePancakeSwapPool,
  analyzeListaPool,
  analyzeAlpacaPool,
  comparePools,
};
