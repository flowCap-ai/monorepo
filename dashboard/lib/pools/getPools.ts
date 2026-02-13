/**
 * getPools.ts - Discover available pools on BNB Chain protocols
 * Returns a list of all tradeable pools/markets for Venus and PancakeSwap
 */

import type { Address } from 'viem';

const VENUS_API_URL = 'https://api.venus.io';

export interface PoolInfo {
  protocol: 'venus' | 'pancakeswap' | 'lista-lending' | 'lista-staking' | 'alpaca';
  poolId: string;
  type: 'lending' | 'lp-farm' | 'liquid-staking';
  assets: string[];

  // Contract addresses for execution
  address: Address; // Pool/vToken contract address
  underlyingTokens?: Address[]; // Underlying token addresses for swaps (e.g., USDT address)

  name: string;
  isActive: boolean;
}

/**
 * Get all Venus lending markets dynamically from Venus API
 */
export async function getVenusPools(): Promise<PoolInfo[]> {
  const pools: PoolInfo[] = [];

  try {
    // Fetch from Venus API (includes vToken and underlying token addresses)
    const response = await fetch(`${VENUS_API_URL}/markets/core-pool?chainId=56`);
    if (!response.ok) {
      console.error('Failed to fetch Venus markets');
      return pools;
    }

    const data = await response.json() as { result?: any[] };
    const markets = data.result || [];

    for (const market of markets) {
      // Skip markets that are not listed or have invalid prices
      if (!market.isListed || market.isPriceInvalid) continue;

      // Skip markets with no underlying symbol (like vCAN which is null)
      if (!market.underlyingSymbol) continue;

      const underlyingSymbol = market.underlyingSymbol;
      const vTokenAddress = market.address as Address;
      const underlyingAddress = market.underlyingAddress as Address;

      pools.push({
        protocol: 'venus',
        poolId: `venus-${underlyingSymbol.toLowerCase()}`,
        type: 'lending',
        assets: [underlyingSymbol],
        address: vTokenAddress, // vToken contract address for analysis
        underlyingTokens: [underlyingAddress], // Underlying token for swaps
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
 * Get PancakeSwap farms from DeFiLlama (includes APY data)
 */
export async function getPancakeSwapPools(): Promise<PoolInfo[]> {
  const pools: PoolInfo[] = [];

  try {
    const response = await fetch('https://yields.llama.fi/pools');
    if (!response.ok) return pools;

    const data = await response.json() as { data?: any[] };
    const allPools = data.data || [];

    // Filter for PancakeSwap on BSC - NO TVL/APY filter to get ALL pools
    const pancakePools = allPools.filter((p: any) => {
      const isPancake = p.project === 'pancakeswap-amm';
      const isBSC = p.chain === 'BSC' || p.chain === 'Binance';
      return isPancake && isBSC;
    });

    // Convert to our PoolInfo format
    for (const p of pancakePools) {
      // Parse pool symbol to get assets (e.g., "WBNB-USDT" -> ["WBNB", "USDT"])
      const assets = p.symbol?.split('-').map((s: string) => s.trim()) || [];

      // DeFiLlama sometimes provides underlyingTokens array
      const underlyingTokens = p.underlyingTokens?.map((addr: string) => addr as Address);

      pools.push({
        protocol: 'pancakeswap',
        poolId: `pancakeswap-${p.pool}`,
        type: 'lp-farm',
        assets,
        address: (p.pool || '0x0') as Address,
        underlyingTokens, // May be undefined if not provided
        name: p.symbol || 'Unknown Pool',
        isActive: true,
      });
    }

    console.log(`Discovered ${pools.length} PancakeSwap pools`);
  } catch (error) {
    console.error('Error fetching PancakeSwap pools:', error);
  }

  return pools;
}

/**
 * Get Lista DAO pools from DeFiLlama (lending + liquid staking + CDP)
 */
export async function getListaPools(): Promise<PoolInfo[]> {
  const pools: PoolInfo[] = [];

  try {
    const response = await fetch('https://yields.llama.fi/pools');
    if (!response.ok) return pools;

    const data = await response.json() as { data?: any[] };
    const allPools = data.data || [];

    // Filter for ALL Lista protocols on BSC with minimum quality filters
    const listaPools = allPools.filter((p: any) => {
      const isLista = p.project === 'lista-lending' ||
                      p.project === 'lista-liquid-staking' ||
                      p.project === 'lista-cdp';
      const isBSC = p.chain === 'BSC' || p.chain === 'Binance';

      // Filter out pools with 0% APY and very low TVL (likely inactive/new)
      const hasReasonableMetrics = p.tvlUsd > 50000 || p.apy > 0;

      return isLista && isBSC && hasReasonableMetrics;
    });

    // Convert to our PoolInfo format
    for (const p of listaPools) {
      const isLending = p.project === 'lista-lending';
      const isStaking = p.project === 'lista-liquid-staking';

      // Parse assets from symbol
      const assets = p.symbol?.split('-').map((s: string) => s.trim()) || [p.symbol || 'Unknown'];

      // Get underlying token addresses if available
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
 * Get Alpaca Finance pools from DeFiLlama (leveraged yield farming)
 */
export async function getAlpacaPools(): Promise<PoolInfo[]> {
  const pools: PoolInfo[] = [];

  try {
    const response = await fetch('https://yields.llama.fi/pools');
    if (!response.ok) return pools;

    const data = await response.json() as { data?: any[] };
    const allPools = data.data || [];

    // Filter for ALL Alpaca Finance on BSC - no TVL/APY filter
    const alpacaPools = allPools.filter((p: any) => {
      const isAlpaca = p.project === 'alpaca-finance' || p.project === 'alpaca-finance-lending';
      const isBSC = p.chain === 'BSC' || p.chain === 'Binance';
      return isAlpaca && isBSC;
    });

    // Convert to our PoolInfo format
    for (const p of alpacaPools) {
      // Parse assets from symbol
      const assets = p.symbol?.split('-').map((s: string) => s.trim()) || [p.symbol || 'Unknown'];

      // Get underlying token addresses if available
      const underlyingTokens = p.underlyingTokens?.map((addr: string) => addr as Address);

      pools.push({
        protocol: 'alpaca',
        poolId: `alpaca-${p.pool}`,
        type: 'lp-farm', // Alpaca is primarily leveraged yield farming
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
 * Get all available pools from all protocols
 */
export async function getAllPools(): Promise<PoolInfo[]> {
  const [venusPools, pancakePools, listaPools, alpacaPools] = await Promise.all([
    getVenusPools(),
    getPancakeSwapPools(),
    getListaPools(),
    getAlpacaPools(),
  ]);

  return [...venusPools, ...pancakePools, ...listaPools, ...alpacaPools];
}

/**
 * Filter pools by user's risk profile
 */
export function filterPoolsByRisk(
  pools: PoolInfo[],
  riskProfile: 'low' | 'medium' | 'high'
): PoolInfo[] {
  const stablecoins = ['USDT', 'USDC', 'BUSD', 'DAI', 'USD1'];

  return pools.filter(pool => {
    // Low risk: Only stablecoin lending on Venus/Lista + Lista liquid staking
    if (riskProfile === 'low') {
      const isStablecoinLending = (pool.protocol === 'venus' || pool.protocol === 'lista-lending') &&
        pool.assets.every(a => stablecoins.includes(a));

      const isListaStaking = pool.protocol === 'lista-staking'; // Liquid staking is low risk

      return isStablecoinLending || isListaStaking;
    }

    // Medium risk: Stablecoins + BNB lending + stablecoin LPs + Lista lending
    if (riskProfile === 'medium') {
      const isLendingLowRisk = (pool.protocol === 'venus' || pool.protocol === 'lista-lending') &&
        (pool.assets.every(a => stablecoins.includes(a)) || pool.assets.includes('BNB'));

      const isStablecoinLP = pool.protocol === 'pancakeswap' &&
        pool.assets.every(a => stablecoins.includes(a) || a === 'WBNB');

      const isListaStaking = pool.protocol === 'lista-staking';

      return isLendingLowRisk || isStablecoinLP || isListaStaking;
    }

    // High risk: All pools allowed (including Alpaca leveraged farming)
    return true;
  });
}

/**
 * Find pools containing specific assets
 */
export function findPoolsByAssets(
  pools: PoolInfo[],
  assets: string[]
): PoolInfo[] {
  return pools.filter(pool =>
    assets.some(asset =>
      pool.assets.some(a => a.toUpperCase() === asset.toUpperCase())
    )
  );
}

export default {
  getAllPools,
  getVenusPools,
  getPancakeSwapPools,
  getListaPools,
  getAlpacaPools,
  filterPoolsByRisk,
  findPoolsByAssets,
};
