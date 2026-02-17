# V3 Concentrated Liquidity - Quick Reference

## Overview

V3 concentrated liquidity provides **higher capital efficiency** but requires **setting 3 additional parameters**:
- **P_a**: Lower price bound
- **P_b**: Upper price bound  
- **h**: Harvest frequency (days between harvests)

## Run Simulation

```bash
npm run run:montecarlo:v3
```

## Configuration

Edit [agents/skills/run_LPV3.ts](../agents/skills/run_LPV3.ts):

```typescript
const CONFIG = {
  V_INITIAL: 10000,        // Initial investment in USD
  PERIOD_DAYS: 90,         // Investment period in days
  ASSET_1: 'USDT',         // First asset
  ASSET_2: 'WBNB',         // Second asset
  P_A: 580,                // Lower price bound (start of your range)
  P_B: 720,                // Upper price bound (end of your range)
  H: 7,                    // Harvest frequency in days (1=daily, 7=weekly, 30=monthly)
  FEE_TIER: 0.0025,        // Pool fee tier (see below)
};
```

**Note:** Current price (P_0) is automatically fetched from CoinGecko's latest data—no need to configure it!

### V3 Fee Tiers

V3 pools have different fee tiers depending on the pair type:

| Fee Tier | LP Share | Effective Fee to LP | Best For |
|----------|----------|---------------------|----------|
| **0.01%** | 67% | 0.000067 | Stablecoin pairs (USDT-BUSD, DAI-USDC) |
| **0.05%** | 67% | 0.000335 | Correlated pairs (WBNB-WETH) |
| **0.25%** | 68% | 0.0017 | Most pairs (default) |
| **1%** | 68% | 0.0068 | Exotic/volatile pairs |

**How to set FEE_TIER:**
- For stablecoins: `FEE_TIER: 0.0001` (0.01%)
- For correlated assets: `FEE_TIER: 0.0005` (0.05%)
- For most pairs: `FEE_TIER: 0.0025` (0.25%)
- For volatile pairs: `FEE_TIER: 0.01` (1%)

## Key Differences from V2

| Aspect | V2 (Full Range) | V3 (Concentrated) |
|--------|----------------|-------------------|
| **Liquidity Range** | 0 to ∞ | [P_a, P_b] |
| **Capital Efficiency** | 1x | 2x to 10x+ |
| **Fees Earned** | Always | Only when in range |
| **IL Risk** | Moderate | Higher (if out of range) |
| **Parameters** | V_initial, period, pair | + P_a, P_b, h |
| **Best For** | Volatile pairs, set-and-forget | Stable pairs, correlated pairs |

## Choosing Your Range Parameters

### Setting P_a and P_b

**Range Width Strategy:**
- **Tight range (±5-10%)**: Higher efficiency, requires price monitoring
- **Medium range (±15-25%)**: Balanced efficiency and safety
- **Wide range (±30-50%)**: Lower efficiency, more conservative

**How to choose:**
1. Look at historical price volatility
2. Narrower range = higher fees per dollar (but more out-of-range risk)
3. Wider range = more safety (but lower capital efficiency)

### Setting h (Harvest Frequency)

- **h = 1**: Daily harvests → Maximum compounding, highest gas costs
- **h = 7**: Weekly harvests → Balanced approach (recommended)
- **h = 14**: Bi-weekly harvests → Lower gas, less compounding
- **h = 30**: Monthly harvests → Minimal gas, minimal compounding

## Understanding Output

### Range Parameters
```json
{
  "optimalPriceRange": {
    "P_a": 580,                  // Your lower price bound
    "P_b": 720,                  // Your upper price bound
    "h": 7,                      // Harvest every 7 days (weekly)
    "rangeWidth": 0.215          // 21.5% range width (P_b - P_a) / P_0
  }
}
```

### Capital Efficiency
```json
{
  "capitalEfficiency": 3.2     // ~3x more efficient than V2
}
```
- **< 2x**: Wide range, similar to V2
- **2-4x**: Balanced, good for moderate volatility
- **4-10x**: Concentrated, high fees but high out-of-range risk
- **> 10x**: Very concentrated, only for very stable pairs

### Risk Interpretation
```json
{
  "probabilityOfLoss": 0.25,   // 25% chance of losing money
  "note": "Balanced range - good capital efficiency with manageable risk"
}
```

**Strategy notes:**
- **"Wide range"**: Consider using V2 instead (volatile pair)
- **"Very narrow range"**: High fees but high out-of-range risk  
- **"Balanced range"**: Optimal for most scenarios

## When to Use V3 vs V2

### Use V3 When:
- ✅ Pair is relatively stable (annualized vol < 50%)
- ✅ Assets are correlated (ETH-WBNB, USDT-BUSD)
- ✅ You want maximum capital efficiency
- ✅ You can rebalance if price exits range

### Use V2 When:
- ✅ Pair is highly volatile (annualized vol > 100%)
- ✅ Assets are uncorrelated (BTC-ETH)
- ✅ You want passive "set and forget"
- ✅ Price movements are unpredictable

## Example Scenarios

### Scenario 1: Stablecoin Pair (USDT-BUSD)
```typescript
const CONFIG = {
  V_INITIAL: 10000,
  PERIOD_DAYS: 90,
  ASSET_1: 'USDT',
  ASSET_2: 'BUSD',
  P_A: 0.995,              // -0.5% (very tight for stablecoin)
  P_B: 1.005,              // +0.5%
  H: 7,                    // Weekly harvests
  FEE_TIER: 0.0001,        // 0.01% fee tier for stablecoins
};
```
**Expected Output:**
- Very narrow range
- High capital efficiency (8x+)
- Low out-of-range risk
- Ideal for V3

### Scenario 2: Correlated Pair (ETH-WBNB)
```typescript
const CONFIG = {
  V_INITIAL: 10000,
  PERIOD_DAYS: 90,
  ASSET_1: 'WBNB',
  ASSET_2: 'WETH',
  P_A: 0.20,               // Set based on expected range
  P_B: 0.24,               // Adjust based on volatility
  H: 7,                    // Weekly harvests
  FEE_TIER: 0.0005,        // 0.05% fee tier for correlated pairs
};
```
**Expected Output:**
- Moderate range
- Good capital efficiency (3-4x)
- Manageable risk
- Good for V3

### Scenario 3: Volatile Pair (BTC-ETH)
```typescript
const CONFIG = {
  V_INITIAL: 10000,
  PERIOD_DAYS: 90,
  ASSET_1: 'WBTC',
  ASSET_2: 'WETH',
  P_A: 0.050,              // Set wider range for volatility
  P_B: 0.060,              // Adjust based on market conditions
  H: 14,                   // Bi-weekly harvests (less frequent for volatile)
  FEE_TIER: 0.0025,        // 0.25% fee tier (standard)
};
```
**Expected Output:**
- Wider range needed for volatility
- Lower capital efficiency (2-3x)
- Higher out-of-range risk
- **Consider V2 for very volatile pairs**

## JSON Output Structure

```json
{
  "strategy": "V3 Concentrated Liquidity",
  "pair": "USDT-WBNB",
  "initialInvestment": 100,
  "currentPrice": 650,
  "period": 365,
  
  "optimalPriceRange": {
    "P_a": 580,
    "P_b": 720,
    "h": 7,
    "rangeWidth": 0.215
  },
  
  "capitalEfficiency": 3.5,
  "expectedFinalValue": 125.50,
  "expectedReturn": 25.50,
  "expectedReturnPercent": 25.50,
  "annualizedAPY": 25.50,
  
  "risk": 18.30,
  "standardDeviation": 22.50,
  "probabilityOfLoss": 0.18,
  "probabilityOfProfit": 0.82,
  
  "worstCase5Percentile": 90.20,
  "bestCase5Percentile": 165.80,
  
  "mu": -0.000123,
  "sigma": 0.035,
  "dataSource": "Historical (CoinGecko)",
  "numSimulations": 1000,
  
  "note": "Balanced range - good capital efficiency with manageable risk"
}
```

## Testing Different Ranges

To test different strategies, simply adjust P_A, P_B, and H:

```typescript
const CONFIG = {
  V_INITIAL: 10000,
  PERIOD_DAYS: 90,
  ASSET_1: 'USDT',
  ASSET_2: 'WETH',
  P_A: 2700,              // Set lower bound (e.g., -10% from current)
  P_B: 3300,              // Set upper bound (e.g., +10% from current)
  H: 7,                   // Weekly harvests
};
```

Run multiple times with different parameters to compare:
- Tight range (±5%) vs wide range (±25%)
- Daily (h=1) vs weekly (h=7) vs monthly (h=30) harvests

## Troubleshooting

### Error: "V3 Pool not found"
- Not all pairs have V3 pools on PancakeSwap
- Try a more popular pair (USDT-WBNB, CAKE-WBNB)
- Or use V2 with `npm run run:montecarlo`

### Capital Efficiency < 2x
- Your range is very wide, similar to V2 full range
- Consider tightening the range for better capital efficiency
- Or use V2 with `npm run run:montecarlo`

### High Probability of Loss
- Your range might be too narrow for the pair's volatility
- Consider widening P_A and P_B
- Or use V2 for more volatile pairs

## Files

- **[agents/skills/analyzePool-LPV3.ts](../agents/skills/analyzePool-LPV3.ts)** - V3 mathematics and Monte Carlo simulation
- **[agents/skills/run_LPV3.ts](../agents/skills/run_LPV3.ts)** - Execution script with configuration
- **npm script**: `run:montecarlo:v3`

## Theory: V3 Formulas

### Position Value
```
If P < P_a:  V = L × (1/√P_a - 1/√P_b) × P    (all in Y token)
If P > P_b:  V = L × (√P_b - √P_a) × P        (all in X token)
Else:        V = L × (√P - √P_a) + L × (1/√P - 1/√P_b) × P
```

### Capital Efficiency
```
Efficiency = √(P_b / P_a)
```

### IL Factor (in range)
```
IL_factor = (2√r - √(P_a/P_0) - √(P_b/P_0)) / (√(P_b/P_0) - √(P_a/P_0))
```

### Fee Multiplier
```
Fee_APY_V3 = Fee_APY_V2 × Efficiency × (time_in_range)
```

---

**Last Updated:** February 2026  
**Version:** 1.0  
**Script:** [agents/skills/run_LPV3.ts](../agents/skills/run_LPV3.ts)
