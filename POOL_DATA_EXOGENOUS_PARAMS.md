# Pool Data with Exogenous Parameters

## Overview

The `getPoolData.ts` skill has been created to fetch pool information with all exogenous parameters required for mathematical yield modeling, based on the formula in `math.md`.

## Exogenous Parameters for DEX Pools (PancakeSwap)

Based on the formula:
```
V_final = V_initial · (2√r / (1+r)) · (1 + h · (V_24h · 0.17 / (TVL_lp + V_initial) + 14500000 · w_pair/Σw · P_cake / (TVL_stack + V_initial)))^(days/h) - 0.00073 · P_gas · P_BNB · ⌈days/h + 1⌉
```

### Parameters Collected

| Parameter | Description | Source |
|-----------|-------------|--------|
| `r` | Price ratio (P_final / P_initial) for impermanent loss | Currently defaults to 1, future: historical price data |
| `V_initial` | User's initial investment (USD) | User input / function parameter |
| `V_24h` | 24-hour trading volume (USD) | DeFiLlama API (`volumeUsd1d`) |
| `TVL_lp` | Total Value Locked in liquidity pool (USD) | DeFiLlama API (`tvlUsd`) |
| `w_pair_ratio` | Weight of pair / Sum of all weights | Calculated: `pool.tvl / total_tvl` |
| `P_cake` | Price of CAKE token (USD) | CoinGecko API |
| `TVL_stack` | Total Value Locked in staking (USD) | DeFiLlama API (`stakedTvl` or fallback to `tvlUsd`) |
| `P_gas` | Gas price (Gwei) | BSCScan Gas Oracle API |
| `P_BNB` | Price of BNB (USD) | CoinGecko API |

## API Integration

### 1. **DeFiLlama Pools API**
- URL: `https://yields.llama.fi/pools`
- Provides: TVL, volume, staking data for all DeFi protocols
- Used for: PancakeSwap, Lista, Alpaca pool discovery

### 2. **CoinGecko Price API**
- URL: `https://api.coingecko.com/api/v3/simple/price`
- Provides: Real-time token prices
- Used for: CAKE and BNB prices

### 3. **BSCScan Gas Oracle**
- URL: `https://api.bscscan.com/api?module=gastracker&action=gasoracle`
- Provides: Current gas price on BSC
- Used for: Gas cost calculations

### 4. **Venus API**
- URL: `https://api.venus.io/markets/core-pool?chainId=56`
- Provides: Venus lending markets data
- Used for: Venus pool discovery (different yield model)

## Data Structure

```typescript
export interface DexExogenousParams {
  r: number;              // Price ratio for IL
  V_initial: number;      // User investment (USD)
  V_24h: number;          // 24h volume (USD)
  TVL_lp: number;         // Pool TVL (USD)
  w_pair_ratio: number;   // Weight ratio
  P_cake: number;         // CAKE price (USD)
  TVL_stack: number;      // Staking TVL (USD)
  P_gas: number;          // Gas price (Gwei)
  P_BNB: number;          // BNB price (USD)
}

export interface PoolData {
  protocol: 'venus' | 'pancakeswap' | 'lista-lending' | 'lista-staking' | 'alpaca';
  poolId: string;
  type: 'lending' | 'lp-farm' | 'liquid-staking';
  assets: string[];
  address: Address;
  underlyingTokens?: Address[];
  name: string;
  isActive: boolean;
  exogenousParams?: DexExogenousParams; // Only for DEX pools
}
```

## Usage

```typescript
import { getAllPoolData, filterPoolsByRisk } from './agents/skills/getPoolData';

// Get all pools with exogenous parameters
// V_initial = user's investment amount (default 1000 USD)
const pools = await getAllPoolData(1000);

// Filter by risk profile
const lowRiskPools = filterPoolsByRisk(pools, 'low');

// Access exogenous parameters for PancakeSwap pools
for (const pool of pools) {
  if (pool.protocol === 'pancakeswap' && pool.exogenousParams) {
    console.log('Pool:', pool.name);
    console.log('24h Volume:', pool.exogenousParams.V_24h);
    console.log('TVL:', pool.exogenousParams.TVL_lp);
    console.log('CAKE Price:', pool.exogenousParams.P_cake);
    console.log('Gas Price:', pool.exogenousParams.P_gas);
    // ... use for yield calculation
  }
}
```

## Functions

### Main Functions

- `getAllPoolData(V_initial?: number)` - Get all pools from all protocols with exogenous params
- `getPancakeSwapPoolData(V_initial?: number)` - Get PancakeSwap pools with full exogenous params
- `getVenusPoolData()` - Get Venus lending markets (no exogenous params yet)
- `getListaPoolData()` - Get Lista DAO pools (no exogenous params yet)
- `getAlpacaPoolData()` - Get Alpaca Finance pools (no exogenous params yet)

### Helper Functions

- `filterPoolsByRisk(pools, riskProfile)` - Filter pools by user risk profile
- `findPoolsByAssets(pools, assets)` - Find pools containing specific assets

## Next Steps

### For `analyzePool.ts`:

The `analyzePool.ts` skill will be updated to:

1. Accept `PoolData` with `exogenousParams`
2. Implement the full mathematical yield model from `math.md`
3. Calculate:
   - Expected yield considering IL, fees, farming rewards, and gas costs
   - Risk score based on volatility and pool metrics
   - Optimal harvest frequency (`h`) and holding period (`days`)
4. Return comprehensive risk/yield analysis

### Example future implementation:

```typescript
// analyzePool.ts (future)
export async function analyzePool(poolData: PoolData, days: number, h: number) {
  if (poolData.protocol === 'pancakeswap' && poolData.exogenousParams) {
    const params = poolData.exogenousParams;

    // Calculate impermanent loss factor
    const IL_factor = (2 * Math.sqrt(params.r)) / (1 + params.r);

    // Calculate APY from fees
    const fee_apy = (params.V_24h * 0.17) / (params.TVL_lp + params.V_initial);

    // Calculate farming rewards APY
    const farming_apy = (14500000 * params.w_pair_ratio * params.P_cake) /
                        (params.TVL_stack + params.V_initial);

    // Calculate gas costs
    const gas_costs = 0.00073 * params.P_gas * params.P_BNB *
                      Math.ceil(days / h + 1);

    // Final value calculation
    const V_final = params.V_initial * IL_factor *
                    Math.pow(1 + h * (fee_apy + farming_apy), days / h) -
                    gas_costs;

    return {
      expectedYield: ((V_final - params.V_initial) / params.V_initial) * 100,
      riskScore: calculateRiskScore(params),
      optimalHarvest: optimizeHarvestFrequency(params),
      // ...
    };
  }
}
```

## Migration Notes

- **Old file**: `agents/skills/getPools.ts` - Returns basic pool info
- **New file**: `agents/skills/getPoolData.ts` - Returns pool info + exogenous parameters
- The old `getPools.ts` can be kept for backward compatibility or removed
- All references in `index.ts` have been updated to use `getPoolData`

## Fallback Values

If external APIs fail, the following defaults are used:

- `P_cake`: $2.50 USD
- `P_BNB`: $600 USD
- `P_gas`: 3 Gwei
- `r`: 1.0 (no price change)

These ensure the system continues to function even with API downtime.
