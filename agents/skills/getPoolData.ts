/**
 * getPoolData.ts - Get pool data with exogenous parameters for yield modeling
 * Returns pool information with all parameters needed for mathematical yield modeling
 *
 * Based on math.md formula:
 * Exogenous Parameters: r, V_initial, V_24h, TVL_lp, w_pair/Σw, P_cake, TVL_stack, P_Gas, P_BNB
 */

import type { Address } from 'viem';

const VENUS_API_URL = 'https://api.venus.io';
const DEFILLAMA_POOLS_URL = 'https://yields.llama.fi/pools';
const COINGECKO_API_URL = 'https://api.coingecko.com/api/v3';
const OWLRACLE_GAS_API = 'https://api.owlracle.info/v2/bsc/gas';
const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex/pairs/bsc';

/**
 * Exogenous parameters for DEX (PancakeSwap) yield modeling
 */
export interface DexExogenousParams {
  // Price ratio (for impermanent loss calculation)
  r: number; // Current price ratio P_final / P_initial

  // User investment
  V_initial: number; // Value sent by user (in USD)

  // Pool liquidity metrics
  V_24h: number; // 24h trading volume (in USD)
  TVL_lp: number; // Total Value Locked in liquidity pool (in USD)

  // Staking/farming metrics
  w_pair_ratio: number; // Weight of this pair / Sum of all weights (for CAKE rewards distribution)
  P_cake: number; // Price of CAKE token (in USD)
  TVL_stack: number; // Total Value Locked in staking/farming (in USD)

  // Gas costs
  P_gas: number; // Gas price (in Gwei)
  P_BNB: number; // Price of BNB (in USD)
}

/**
 * Pool information with exogenous parameters
 */
export interface PoolData {
  protocol: 'venus' | 'pancakeswap' | 'lista-lending' | 'lista-staking' | 'alpaca';
  poolId: string;
  type: 'lending' | 'lp-farm' | 'liquid-staking';
  assets: string[];

  // Contract addresses for execution
  address: Address; // Pool/vToken contract address
  underlyingTokens?: Address[]; // Underlying token addresses for swaps

  name: string;
  isActive: boolean;

  // Exogenous parameters (only for DEX pools like PancakeSwap)
  exogenousParams?: DexExogenousParams;
}

/**
 * Get current gas price from Owlracle
 */
async function getCurrentGasPrice(): Promise<number> {
  try {
    const response = await fetch(OWLRACLE_GAS_API);
    if (!response.ok) return 3; // Default 3 Gwei if API fails

    const data = await response.json() as any;
    // Get standard speed (index 2, usually ~90% acceptance rate)
    const standardSpeed = data.speeds?.[2];
    return standardSpeed?.gasPrice || 3;
  } catch (error) {
    console.warn('Failed to fetch gas price from Owlracle, using default 3 Gwei:', error);
    return 3;
  }
}

/**
 * Get token prices from CoinGecko
 */
async function getTokenPrices(): Promise<{ cake: number; bnb: number }> {
  try {
    const response = await fetch(
      `${COINGECKO_API_URL}/simple/price?ids=pancakeswap-token,binancecoin&vs_currencies=usd`
    );

    if (!response.ok) {
      return { cake: 2.5, bnb: 600 }; // Default prices if API fails
    }

    const data = await response.json() as any;
    return {
      cake: data['pancakeswap-token']?.usd || 2.5,
      bnb: data['binancecoin']?.usd || 600,
    };
  } catch (error) {
    console.warn('Failed to fetch token prices, using defaults:', error);
    return { cake: 2.5, bnb: 600 };
  }
}

/**
 * Calculate price ratio r for impermanent loss
 * r = P_final / P_initial
 * For new positions, we assume r = 1 (no price change yet)
 */
function calculatePriceRatio(): number {
  // TODO: In future, fetch historical prices and calculate actual ratio
  // For now, return 1 (neutral position)
  return 1;
}

/**
 * Enrich pool data with DexScreener volume and liquidity data
 * Search by token symbols since DeFiLlama pool IDs are UUIDs, not contract addresses
 */
async function enrichWithDexScreenerData(assets: string[]): Promise<{ volume24h: number; liquidity: number } | null> {
  try {
    if (assets.length < 2) return null;

    // Search for the pair by token symbols
    const searchQuery = assets.join(' ');
    const response = await fetch(`https://api.dexscreener.com/latest/dex/search/?q=${encodeURIComponent(searchQuery)}`);
    if (!response.ok) return null;

    const data = await response.json() as any;
    const pairs = data.pairs || [];

    // Find all PancakeSwap pairs on BSC with matching tokens
    const pancakePairs = pairs.filter((p: any) =>
      p.chainId === 'bsc' &&
      p.dexId === 'pancakeswap' &&
      assets.every(asset =>
        p.baseToken?.symbol?.toUpperCase() === asset.toUpperCase() ||
        p.quoteToken?.symbol?.toUpperCase() === asset.toUpperCase()
      )
    );

    if (pancakePairs.length === 0) return null;

    // Prefer V2 pools (more stable liquidity), or pick the one with highest liquidity
    const v2Pair = pancakePairs.find((p: any) => p.labels?.includes('v2'));
    const pancakePair = v2Pair || pancakePairs.reduce((max: any, p: any) =>
      (p.liquidity?.usd || 0) > (max.liquidity?.usd || 0) ? p : max
    );

    return {
      volume24h: pancakePair.volume?.h24 || 0,
      liquidity: pancakePair.liquidity?.usd || 0,
    };
  } catch (error) {
    console.warn(`Failed to fetch DexScreener data for ${assets.join('-')}:`, error);
    return null;
  }
}

/**
 * Get PancakeSwap pools with exogenous parameters
 */
export async function getPancakeSwapPoolData(V_initial: number = 1000): Promise<PoolData[]> {
  const pools: PoolData[] = [];

  try {
    // Fetch token prices and gas price in parallel
    const [tokenPrices, gasPrice, poolsResponse] = await Promise.all([
      getTokenPrices(),
      getCurrentGasPrice(),
      fetch(DEFILLAMA_POOLS_URL),
    ]);

    if (!poolsResponse.ok) return pools;

    const data = await poolsResponse.json() as { data?: any[] };
    const allPools = data.data || [];

    // Filter for PancakeSwap on BSC
    const pancakePools = allPools.filter((p: any) => {
      const isPancake = p.project === 'pancakeswap-amm';
      const isBSC = p.chain === 'BSC' || p.chain === 'Binance';
      return isPancake && isBSC;
    });

    // Total staked value across all PancakeSwap farms (for weight calculation)
    const totalTVL = pancakePools.reduce((sum: number, p: any) => sum + (p.tvlUsd || 0), 0);

    // Convert to our PoolData format with exogenous parameters
    // Process pools with rate limiting for DexScreener API
    const BATCH_SIZE = 3; // Smaller batch to avoid rate limits
    for (let i = 0; i < pancakePools.length; i += BATCH_SIZE) {
      const batch = pancakePools.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (p: any) => {
          // Parse pool symbol to get assets
          const assets = p.symbol?.split('-').map((s: string) => s.trim()) || [];
          const underlyingTokens = p.underlyingTokens?.map((addr: string) => addr as Address);
          const poolAddress = p.pool || '0x0';

          // Get DexScreener data for accurate volume and liquidity
          const dexData = await enrichWithDexScreenerData(assets);

          // Extract pool metrics - prefer DexScreener data if available
          const TVL_lp = dexData?.liquidity || p.tvlUsd || 0;
          const V_24h = dexData?.volume24h || p.volumeUsd1d || 0;

          // Calculate weight ratio (this pool's TVL / total TVL)
          const w_pair_ratio = totalTVL > 0 ? TVL_lp / totalTVL : 0;

          // For staking TVL, use DexScreener liquidity or fallback to TVL
          const TVL_stack = dexData?.liquidity || p.stakedTvl || TVL_lp;

          // Calculate price ratio
          const r = calculatePriceRatio();

          pools.push({
            protocol: 'pancakeswap',
            poolId: `pancakeswap-${poolAddress}`,
            type: 'lp-farm',
            assets,
            address: poolAddress as Address,
            underlyingTokens,
            name: p.symbol || 'Unknown Pool',
            isActive: true,
            exogenousParams: {
              r,
              V_initial,
              V_24h,
              TVL_lp,
              w_pair_ratio,
              P_cake: tokenPrices.cake,
              TVL_stack,
              P_gas: gasPrice,
              P_BNB: tokenPrices.bnb,
            },
          });
        })
      );

      // Small delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < pancakePools.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    console.log(`Discovered ${pools.length} PancakeSwap pools with exogenous parameters`);
  } catch (error) {
    console.error('Error fetching PancakeSwap pool data:', error);
  }

  return pools;
}

/**
 * Get Venus lending markets (no exogenous params needed yet - different yield model)
 */
export async function getVenusPoolData(): Promise<PoolData[]> {
  const pools: PoolData[] = [];

  try {
    const response = await fetch(`${VENUS_API_URL}/markets/core-pool?chainId=56`);
    if (!response.ok) {
      console.error('Failed to fetch Venus markets');
      return pools;
    }

    const data = await response.json() as { result?: any[] };
    const markets = data.result || [];

    for (const market of markets) {
      if (!market.isListed || market.isPriceInvalid || !market.underlyingSymbol) continue;

      const underlyingSymbol = market.underlyingSymbol;
      const vTokenAddress = market.address as Address;
      const underlyingAddress = market.underlyingAddress as Address;

      pools.push({
        protocol: 'venus',
        poolId: `venus-${underlyingSymbol.toLowerCase()}`,
        type: 'lending',
        assets: [underlyingSymbol],
        address: vTokenAddress,
        underlyingTokens: [underlyingAddress],
        name: `${underlyingSymbol} Supply`,
        isActive: true,
        // No exogenousParams - Venus uses different yield model
      });
    }

    console.log(`Discovered ${pools.length} Venus Core Pool markets`);
  } catch (error) {
    console.error('Error fetching Venus pools:', error);
  }

  return pools;
}

/**
 * Get Lista DAO pools (no exogenous params needed yet)
 */
export async function getListaPoolData(): Promise<PoolData[]> {
  const pools: PoolData[] = [];

  try {
    const response = await fetch(DEFILLAMA_POOLS_URL);
    if (!response.ok) return pools;

    const data = await response.json() as { data?: any[] };
    const allPools = data.data || [];

    const listaPools = allPools.filter((p: any) => {
      const isLista = p.project === 'lista-lending' ||
                      p.project === 'lista-liquid-staking' ||
                      p.project === 'lista-cdp';
      const isBSC = p.chain === 'BSC' || p.chain === 'Binance';
      return isLista && isBSC;
    });

    for (const p of listaPools) {
      const isLending = p.project === 'lista-lending';
      const isStaking = p.project === 'lista-liquid-staking';
      const assets = p.symbol?.split('-').map((s: string) => s.trim()) || [p.symbol || 'Unknown'];
      const underlyingTokens = p.underlyingTokens?.map((addr: string) => addr as Address);

      pools.push({
        protocol: isLending ? 'lista-lending' : 'lista-staking',
        poolId: `${p.project}-${p.pool}`,
        type: isStaking ? 'liquid-staking' : 'lending',
        assets,
        address: (p.pool || '0x0') as Address,
        underlyingTokens,
        name: p.symbol || 'Unknown Pool',
        isActive: true,
        // No exogenousParams yet - different yield model
      });
    }

    console.log(`Discovered ${pools.length} Lista pools`);
  } catch (error) {
    console.error('Error fetching Lista pools:', error);
  }

  return pools;
}

/**
 * Get Alpaca Finance pools (no exogenous params needed yet)
 */
export async function getAlpacaPoolData(): Promise<PoolData[]> {
  const pools: PoolData[] = [];

  try {
    const response = await fetch(DEFILLAMA_POOLS_URL);
    if (!response.ok) return pools;

    const data = await response.json() as { data?: any[] };
    const allPools = data.data || [];

    const alpacaPools = allPools.filter((p: any) => {
      const isAlpaca = p.project === 'alpaca-finance' || p.project === 'alpaca-finance-lending';
      const isBSC = p.chain === 'BSC' || p.chain === 'Binance';
      return isAlpaca && isBSC;
    });

    for (const p of alpacaPools) {
      const assets = p.symbol?.split('-').map((s: string) => s.trim()) || [p.symbol || 'Unknown'];
      const underlyingTokens = p.underlyingTokens?.map((addr: string) => addr as Address);

      pools.push({
        protocol: 'alpaca',
        poolId: `alpaca-${p.pool}`,
        type: 'lp-farm',
        assets,
        address: (p.pool || '0x0') as Address,
        underlyingTokens,
        name: p.symbol || 'Unknown Pool',
        isActive: true,
        // No exogenousParams yet
      });
    }

    console.log(`Discovered ${pools.length} Alpaca pools`);
  } catch (error) {
    console.error('Error fetching Alpaca pools:', error);
  }

  return pools;
}

/**
 * Get all available pools with exogenous parameters
 * @param V_initial - User's initial investment amount (in USD)
 */
export async function getAllPoolData(V_initial: number = 1000): Promise<PoolData[]> {
  const [venusPools, pancakePools, listaPools, alpacaPools] = await Promise.all([
    getVenusPoolData(),
    getPancakeSwapPoolData(V_initial),
    getListaPoolData(),
    getAlpacaPoolData(),
  ]);

  return [...venusPools, ...pancakePools, ...listaPools, ...alpacaPools];
}

/**
 * Filter pools by user's risk profile
 */
export function filterPoolsByRisk(
  pools: PoolData[],
  riskProfile: 'low' | 'medium' | 'high'
): PoolData[] {
  const stablecoins = ['USDT', 'USDC', 'BUSD', 'DAI', 'USD1'];

  return pools.filter(pool => {
    if (riskProfile === 'low') {
      const isStablecoinLending = (pool.protocol === 'venus' || pool.protocol === 'lista-lending') &&
        pool.assets.every(a => stablecoins.includes(a));
      const isListaStaking = pool.protocol === 'lista-staking';
      return isStablecoinLending || isListaStaking;
    }

    if (riskProfile === 'medium') {
      const isLendingLowRisk = (pool.protocol === 'venus' || pool.protocol === 'lista-lending') &&
        (pool.assets.every(a => stablecoins.includes(a)) || pool.assets.includes('BNB'));
      const isStablecoinLP = pool.protocol === 'pancakeswap' &&
        pool.assets.every(a => stablecoins.includes(a) || a === 'WBNB');
      const isListaStaking = pool.protocol === 'lista-staking';
      return isLendingLowRisk || isStablecoinLP || isListaStaking;
    }

    return true; // High risk: all pools allowed
  });
}

/**
 * Find pools containing specific assets
 */
export function findPoolsByAssets(
  pools: PoolData[],
  assets: string[]
): PoolData[] {
  return pools.filter(pool =>
    assets.some(asset =>
      pool.assets.some(a => a.toUpperCase() === asset.toUpperCase())
    )
  );
}

export default {
  getAllPoolData,
  getVenusPoolData,
  getPancakeSwapPoolData,
  getListaPoolData,
  getAlpacaPoolData,
  filterPoolsByRisk,
  findPoolsByAssets,
};
