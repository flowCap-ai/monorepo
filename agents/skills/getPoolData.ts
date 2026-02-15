import type { Address } from 'viem';

const VENUS_API_URL = process.env.VENUS_API_URL || 'https://api.venus.io';
const DEFILLAMA_POOLS_URL = `${process.env.DEFILLAMA_API_URL || 'https://yields.llama.fi'}/pools`;
const COINGECKO_API_URL = process.env.COINGECKO_API_URL || 'https://api.coingecko.com/api/v3';
const OWLRACLE_GAS_API = process.env.OWLRACLE_GAS_API || 'https://api.owlracle.info/v2/bsc/gas';
const DEXSCREENER_API_BASE = process.env.DEXSCREENER_API || 'https://api.dexscreener.com/latest/dex';

/**
 * Exogenous parameters for DEX (PancakeSwap) yield modeling
 */
export interface DexExogenousParams {
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

  // Pool version (for PancakeSwap V2 vs V3)
  version?: 'v2' | 'v3';

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
 * Enrich pool data with DexScreener volume and liquidity data
 * Returns both V2 and V3 pool data if available
 */
async function enrichWithDexScreenerData(assets: string[]): Promise<{
  v2?: { volume24h: number; liquidity: number; pairAddress: string };
  v3?: { volume24h: number; liquidity: number; pairAddress: string };
} | null> {
  try {
    if (assets.length < 2) return null;

    // Search for the pair by token symbols
    const searchQuery = assets.join(' ');
    const response = await fetch(`${DEXSCREENER_API_BASE}/search/?q=${encodeURIComponent(searchQuery)}`);
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

    // Get V2 pool (highest liquidity V2)
    const v2Pairs = pancakePairs.filter((p: any) => p.labels?.includes('v2'));
    const v2Pair = v2Pairs.length > 0 ? v2Pairs.reduce((max: any, p: any) =>
      (p.liquidity?.usd || 0) > (max.liquidity?.usd || 0) ? p : max
    ) : null;

    // Get V3 pool (highest liquidity V3)
    const v3Pairs = pancakePairs.filter((p: any) => p.labels?.includes('v3'));
    const v3Pair = v3Pairs.length > 0 ? v3Pairs.reduce((max: any, p: any) =>
      (p.liquidity?.usd || 0) > (max.liquidity?.usd || 0) ? p : max
    ) : null;

    return {
      v2: v2Pair ? {
        volume24h: v2Pair.volume?.h24 || 0,
        liquidity: v2Pair.liquidity?.usd || 0,
        pairAddress: v2Pair.pairAddress,
      } : undefined,
      v3: v3Pair ? {
        volume24h: v3Pair.volume?.h24 || 0,
        liquidity: v3Pair.liquidity?.usd || 0,
        pairAddress: v3Pair.pairAddress,
      } : undefined,
    };
  } catch (error) {
    console.warn(`Failed to fetch DexScreener data for ${assets.join('-')}:`, error);
    return null;
  }
}

/**
 * Get PancakeSwap pools with exogenous parameters
 * @param V_initial - User's initial investment amount (in USD)
 * @param riskProfile - Optional risk profile to filter pools
 */
export async function getPancakeSwapPoolData(
  V_initial: number = 1000,
  riskProfile?: 'low' | 'medium' | 'high'
): Promise<PoolData[]> {
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

          // Get DexScreener data for both V2 and V3
          const dexData = await enrichWithDexScreenerData(assets);

          // Create pool entries for both V2 and V3 if they exist
          const versions = [
            { version: 'v2' as const, data: dexData?.v2 },
            { version: 'v3' as const, data: dexData?.v3 },
          ];

          for (const { version, data } of versions) {
            if (!data) continue; // Skip if this version doesn't exist

            // Extract pool metrics from DexScreener
            const TVL_lp = data.liquidity || p.tvlUsd || 0;
            const V_24h = data.volume24h || p.volumeUsd1d || 0;

            // Calculate weight ratio (this pool's TVL / total TVL)
            const w_pair_ratio = totalTVL > 0 ? TVL_lp / totalTVL : 0;

            // For staking TVL, use liquidity
            const TVL_stack = data.liquidity || p.stakedTvl || TVL_lp;

            pools.push({
              protocol: 'pancakeswap',
              poolId: `pancakeswap-${version}-${data.pairAddress}`,
              type: 'lp-farm',
              assets,
              address: data.pairAddress as Address,
              underlyingTokens,
              name: `${p.symbol || 'Unknown Pool'} (${version.toUpperCase()})`,
              isActive: true,
              version,
              exogenousParams: {
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
          }
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

  // Apply risk filter if specified
  if (riskProfile) {
    const filteredPools = filterPoolsByRisk(pools, riskProfile);
    console.log(`Filtered to ${filteredPools.length} pools based on ${riskProfile} risk profile`);
    return filteredPools;
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
 * @param riskProfile - Optional risk profile to filter pools
 */
export async function getAllPoolData(
  V_initial: number = 1000,
  riskProfile?: 'low' | 'medium' | 'high'
): Promise<PoolData[]> {
  const [venusPools, pancakePools, listaPools, alpacaPools] = await Promise.all([
    getVenusPoolData(),
    getPancakeSwapPoolData(V_initial, riskProfile),
    getListaPoolData(),
    getAlpacaPoolData(),
  ]);

  const allPools = [...venusPools, ...pancakePools, ...listaPools, ...alpacaPools];

  // Apply risk filter if specified
  if (riskProfile) {
    const filteredPools = filterPoolsByRisk(allPools, riskProfile);
    console.log(`Total pools after ${riskProfile} risk filter: ${filteredPools.length}`);
    return filteredPools;
  }

  return allPools;
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
