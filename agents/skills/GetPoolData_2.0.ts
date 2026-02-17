import type { Address } from 'viem';

const VENUS_API_URL = process.env.VENUS_API_URL || 'https://api.venus.io';
const DEFILLAMA_POOLS_URL = `${process.env.DEFILLAMA_API_URL || 'https://yields.llama.fi'}/pools`;
const COINGECKO_API_URL = process.env.COINGECKO_API_URL || 'https://api.coingecko.com/api/v3';
const OWLRACLE_GAS_API = process.env.OWLRACLE_GAS_API || 'https://api.owlracle.info/v2/bsc/gas';

// DexScreener API - but we'll filter for main pools by highest liquidity
const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex';

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
 * Fetch pool data from DexScreener, filtering for the main PancakeSwap V2 pool
 * Selects the pool with highest liquidity to ensure we get the correct one
 * Uses token addresses to avoid fake tokens with similar symbols
 */
async function fetchPancakeSwapPairData(token0: string, token1: string): Promise<{
  v2?: { volume24h: number; liquidity: number; pairAddress: string };
  v3?: { volume24h: number; liquidity: number; pairAddress: string };
} | null> {
  try {
    // Normalize token names for comparison
    const normalizeToken = (token: string): string => {
      const upper = token.toUpperCase();
      if (upper === 'BNB') return 'WBNB';
      return upper;
    };
    
    const t0 = normalizeToken(token0);
    const t1 = normalizeToken(token1);
    
    // Common BSC token addresses (verified official addresses)
    const knownAddresses: Record<string, string> = {
      'WBNB': '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
      'USDT': '0x55d398326f99059fF775485246999027B3197955',
      'USDC': '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
      'BUSD': '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
      'ETH': '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
      'BTCB': '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
      'CAKE': '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
    };
    
    const addr0 = knownAddresses[t0];
    const addr1 = knownAddresses[t1];
    
    let allPairs: any[] = [];
    
    // Strategy 1: If we have both addresses, query by token address (most accurate)
    // This avoids fake tokens with similar symbols
    // Try both tokens since API may return different pairs depending on which token is queried
    if (addr0 && addr1) {
      const tokensToQuery = [addr0, addr1];
      
      for (const tokenAddr of tokensToQuery) {
        try {
          const response = await fetch(`${DEXSCREENER_API}/tokens/${tokenAddr}`);
          if (response.ok) {
            const result = await response.json() as any;
            const pairs = result.pairs || [];
            
            // Filter for pairs that contain BOTH tokens (by address)
            const matchingPairs = pairs.filter((pair: any) => {
              const baseAddr = pair.baseToken?.address?.toLowerCase();
              const quoteAddr = pair.quoteToken?.address?.toLowerCase();
              const addr0Lower = addr0.toLowerCase();
              const addr1Lower = addr1.toLowerCase();
              
              return (baseAddr === addr0Lower && quoteAddr === addr1Lower) || 
                     (baseAddr === addr1Lower && quoteAddr === addr0Lower);
            });
            
            allPairs = [...allPairs, ...matchingPairs];
            console.log(`   💡 Found ${matchingPairs.length} pairs by token address lookup (${tokenAddr.slice(0, 6)}...)`);
          }
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (err) {
          console.warn(`Token address search failed for ${tokenAddr}:`, err);
        }
      }
    }
    
    // Strategy 2: If no address match, fall back to symbol search (less reliable)
    if (allPairs.length === 0) {
      const strategies = [
        `${token0} ${token1}`,
        `${token0}`,
        `${token1}`,
      ];
      
      for (const searchQuery of strategies) {
        try {
          const response = await fetch(`${DEXSCREENER_API}/search?q=${encodeURIComponent(searchQuery)}`);
          
          if (response.ok) {
            const result = await response.json() as any;
            const pairs = result.pairs || [];
            allPairs = [...allPairs, ...pairs];
          }
          
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (err) {
          console.warn(`Search strategy "${searchQuery}" failed:`, err);
        }
      }
    }
    
    if (allPairs.length === 0) {
      console.warn('DexScreener API returned no results');
      return null;
    }
    
    // Remove duplicates by pair address
    const uniquePairs = Array.from(
      new Map(allPairs.map(pair => [pair.pairAddress, pair])).values()
    );
    
    // Filter for PancakeSwap on BSC with matching tokens
    const matchingPairs = uniquePairs.filter((pair: any) => {
      if (pair.chainId !== 'bsc') return false;
      if (!pair.dexId?.toLowerCase().startsWith('pancakeswap')) return false;
      
      // If we have addresses, validate by address (prevents fake tokens)
      if (addr0 && addr1) {
        const baseAddr = pair.baseToken?.address?.toLowerCase();
        const quoteAddr = pair.quoteToken?.address?.toLowerCase();
        const a0 = addr0.toLowerCase();
        const a1 = addr1.toLowerCase();
        
        return (baseAddr === a0 && quoteAddr === a1) || (baseAddr === a1 && quoteAddr === a0);
      }
      
      // Otherwise validate by symbol (less safe)
      const baseSymbol = normalizeToken(pair.baseToken?.symbol || '');
      const quoteSymbol = normalizeToken(pair.quoteToken?.symbol || '');
      
      return (baseSymbol === t0 && quoteSymbol === t1) || (baseSymbol === t1 && quoteSymbol === t0);
    });
    
    if (matchingPairs.length === 0) {
      console.warn(`⚠️  No PancakeSwap pair found for ${token0}-${token1} on BSC`);
      return null;
    }
    
    // Log all matching pairs for debugging
    if (matchingPairs.length > 1) {
      console.log(`   📋 Found ${matchingPairs.length} matching pools:`);
      matchingPairs.slice(0, 10).forEach((p: any, i: number) => {
        console.log(`      ${i + 1}. ${p.dexId} - $${parseFloat(p.liquidity?.usd || '0').toLocaleString()} liquidity - $${parseFloat(p.volume?.h24 || '0').toLocaleString()} volume`);
      });
    }
    
    // Separate V2 and V3 pools based on labels
    const v2Pairs = matchingPairs.filter((p: any) => 
      p.labels?.includes('v2') || (!p.labels?.includes('v3') && !p.labels?.includes('v2'))
    );
    const v3Pairs = matchingPairs.filter((p: any) => p.labels?.includes('v3'));
    
    // Sort each group by liquidity (highest first)
    v2Pairs.sort((a: any, b: any) => {
      const liqA = parseFloat(a.liquidity?.usd || '0');
      const liqB = parseFloat(b.liquidity?.usd || '0');
      return liqB - liqA;
    });
    
    v3Pairs.sort((a: any, b: any) => {
      const liqA = parseFloat(a.liquidity?.usd || '0');
      const liqB = parseFloat(b.liquidity?.usd || '0');
      return liqB - liqA;
    });
    
    let v2Data: { volume24h: number; liquidity: number; pairAddress: string } | undefined;
    let v3Data: { volume24h: number; liquidity: number; pairAddress: string } | undefined;
    
    // Get V2 pool data
    if (v2Pairs.length > 0) {
      const v2Pool = v2Pairs[0];
      v2Data = {
        volume24h: parseFloat(v2Pool.volume?.h24 || '0'),
        liquidity: parseFloat(v2Pool.liquidity?.usd || '0'),
        pairAddress: v2Pool.pairAddress,
      };
      console.log(`✅ Found PancakeSwap V2 pool for ${t0}-${t1}:`);
      console.log(`   Address: ${v2Data.pairAddress}`);
      console.log(`   Liquidity: $${v2Data.liquidity.toLocaleString()}`);
      console.log(`   Volume 24h: $${v2Data.volume24h.toLocaleString()}`);
    }
    
    // Get V3 pool data
    if (v3Pairs.length > 0) {
      const v3Pool = v3Pairs[0];
      v3Data = {
        volume24h: parseFloat(v3Pool.volume?.h24 || '0'),
        liquidity: parseFloat(v3Pool.liquidity?.usd || '0'),
        pairAddress: v3Pool.pairAddress,
      };
      console.log(`✅ Found PancakeSwap V3 pool for ${t0}-${t1}:`);
      console.log(`   Address: ${v3Data.pairAddress}`);
      console.log(`   Liquidity: $${v3Data.liquidity.toLocaleString()}`);
      console.log(`   Volume 24h: $${v3Data.volume24h.toLocaleString()}`);
      if (v3Pairs.length > 1) {
        console.log(`   ℹ️  ${v3Pairs.length} V3 pools found, selected highest liquidity`);
      }
    }
    
    return {
      v2: v2Data,
      v3: v3Data,
    };
  } catch (error) {
    console.error(`Error fetching PancakeSwap data for ${token0}-${token1}:`, error);
    return null;
  }
}

/**
 * Get PancakeSwap pools with exogenous parameters using official PancakeSwap API
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
    // Process pools with rate limiting
    const BATCH_SIZE = 3;
    for (let i = 0; i < pancakePools.length; i += BATCH_SIZE) {
      const batch = pancakePools.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (p: any) => {
          // Parse pool symbol to get assets
          const assets = p.symbol?.split('-').map((s: string) => s.trim()) || [];
          const underlyingTokens = p.underlyingTokens?.map((addr: string) => addr as Address);
          
          if (assets.length < 2) return; // Skip invalid pools

          // Fetch data from PancakeSwap official API
          const pancakeData = await fetchPancakeSwapPairData(assets[0], assets[1]);

          if (!pancakeData?.v2 && !pancakeData?.v3) return; // Skip if no data found

          // Add V2 pool if exists
          if (pancakeData.v2) {
            const TVL_lp = pancakeData.v2.liquidity;
            const V_24h = pancakeData.v2.volume24h;
            const pairAddress = pancakeData.v2.pairAddress;

            // Calculate weight ratio (this pool's TVL / total TVL)
            const w_pair_ratio = totalTVL > 0 ? TVL_lp / totalTVL : 0;

            // For staking TVL, assume it equals liquidity TVL
            const TVL_stack = TVL_lp;

            pools.push({
              protocol: 'pancakeswap',
              poolId: `pancakeswap-v2-${pairAddress}`,
              type: 'lp-farm',
              assets,
              address: pairAddress as Address,
              underlyingTokens,
              name: `${assets.join('-')} (V2)`,
              isActive: true,
              version: 'v2',
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

          // Add V3 pool if exists
          if (pancakeData.v3) {
            const TVL_lp = pancakeData.v3.liquidity;
            const V_24h = pancakeData.v3.volume24h;
            const pairAddress = pancakeData.v3.pairAddress;

            // Calculate weight ratio (this pool's TVL / total TVL)
            const w_pair_ratio = totalTVL > 0 ? TVL_lp / totalTVL : 0;

            // For staking TVL, assume it equals liquidity TVL
            const TVL_stack = TVL_lp;

            pools.push({
              protocol: 'pancakeswap',
              poolId: `pancakeswap-v3-${pairAddress}`,
              type: 'lp-farm',
              assets,
              address: pairAddress as Address,
              underlyingTokens,
              name: `${assets.join('-')} (V3)`,
              isActive: true,
              version: 'v3',
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

      // Small delay between batches to avoid overwhelming the API
      if (i + BATCH_SIZE < pancakePools.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
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
      });
    }

    console.log(`Discovered ${pools.length} Venus Core Pool markets`);
  } catch (error) {
    console.error('Error fetching Venus pools:', error);
  }

  return pools;
}

/**
 * Get Lista DAO pools
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
      });
    }

    console.log(`Discovered ${pools.length} Lista pools`);
  } catch (error) {
    console.error('Error fetching Lista pools:', error);
  }

  return pools;
}

/**
 * Get Alpaca Finance pools
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
