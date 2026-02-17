# Simple V_final Calculator - Quick Start Guide

## 🎯 Overview

This feature allows you to quickly calculate **V_final** (final position value) for a PancakeSwap V2 LP investment by providing:
- **User inputs**: Initial investment, investment period, expected price change
- **On-chain data**: Pool volume, liquidity, rewards, gas prices, etc.

**The harvest frequency (h) is automatically optimized** to maximize V_final!

## 🚀 Quick Start

### Option 1: Interactive Calculator (Recommended)

Launch the interactive calculator that guides you step by step:

```bash
npm run calc:final
```

You'll be prompted for:

**User Inputs:**
- `V_initial`: Initial investment in USD
- `days`: Investment period in days
- `r`: Price ratio `r = P_final / P_initial`
  - `r = 1.0`: No price change
  - `r = 1.25`: +25% price increase (IL risk)
  - `r = 0.8`: -20% price decrease (IL risk)

**On-Chain Data:**
- `V_24h`: 24-hour trading volume (USD)
- `TVL_lp`: Total pool liquidity (USD)
- `w_pair_ratio`: Pool weight in reward distribution (0-1)
- `P_cake`: CAKE token price (USD)
- `TVL_stack`: Staked TVL for rewards (USD)
- `P_gas`: Gas price (Gwei)
- `P_BNB`: BNB token price (USD)

**Output:**
```
V_final = $10,195.80

Additional Info:
  Initial investment: $10,000.00
  Final value:        $10,195.80
  Total return:       $195.80 (1.96%)
  Annualized APY:     7.94%
  Period:             90 days
  Price ratio (r):    1.25
  Impermanent Loss:   -0.62%
```

### Option 2: Quick Test with Default Values

To see examples with 3 realistic scenarios:

```bash
npm run quick:final
```

Displays:
- **Scenario 1**: Stable pool (WBNB-BUSD), 30 days, r=1.0
- **Scenario 2**: Volatile pool (ETH-BNB), 90 days, r=1.25 (+25%)
- **Scenario 3**: Low liquidity pool (ALT-BUSD), 60 days, r=0.9 (-10%)

### Option 3: Code Integration

```typescript
import { calculateOptimizedFinalValue } from './agents/skills/analyzePool-LPV2.js';

// User inputs
const userInputs = {
  V_initial: 10000,  // $10,000
  days: 90,          // 90 days
  r: 1.25            // +25% price increase
};

// On-chain data (fetch from APIs)
const onChainData = {
  V_24h: 8_000_000,     // 24h volume
  TVL_lp: 60_000_000,   // Pool liquidity
  w_pair_ratio: 0.08,   // 8% of emissions
  P_cake: 2.5,          // $2.50 CAKE
  TVL_stack: 50_000_000,// Staked TVL
  P_gas: 3,             // 3 Gwei
  P_BNB: 600            // $600 BNB
};

// Calculate
const V_final = calculateOptimizedFinalValue(userInputs, onChainData);

console.log(`Final value: $${V_final.toFixed(2)}`);
```

## 📊 Understanding Price Ratio (r)

The `r` parameter represents the expected price change between the two pool tokens:

### Formula
```
r = P_final / P_initial
```

Where:
- `P_final`: Expected relative price at end of period
- `P_initial`: Current relative price (normalized to 1)

### Practical Examples

#### ETH-BUSD pool, current ETH price = $3,000

| Scenario | Final ETH Price | Calculation | r | IL Impact |
|----------|----------------|-------------|---|-----------|
| No change | $3,000 | 3000/3000 | 1.0 | 0% |
| ETH +10% | $3,300 | 3300/3000 | 1.1 | -0.23% |
| ETH +25% | $3,750 | 3750/3000 | 1.25 | -0.62% |
| ETH +50% | $4,500 | 4500/3000 | 1.5 | -2.02% |
| ETH -10% | $2,700 | 2700/3000 | 0.9 | -0.14% |
| ETH -25% | $2,250 | 2250/3000 | 0.75 | -0.85% |

### Impermanent Loss (IL)

Impermanent loss depends on `r` according to:

```
IL_factor = (2 × √r) / (1 + r)
```

**The further `r` is from 1.0, the higher the IL.**

```
r = 1.0  → IL = 0.00%  (no change)
r = 1.1  → IL = -0.23% (small change)
r = 1.25 → IL = -0.62% (moderate change)
r = 1.5  → IL = -2.02% (large change)
r = 2.0  → IL = -5.72% (price doubles)
```

## 🔧 Automatic h Optimization

The function tests **10 different harvest frequencies**:

| Frequency | h (hours) | Period |
|-----------|-----------|--------|
| Very high | 1 | Every hour |
| High | 2, 4, 6, 8 | Multiple times per day |
| Medium | 12, 24 | 1-2 times per day |
| Low | 48, 72 | Every 2-3 days |
| Very low | 168 | Weekly |

**For each frequency:**
1. Calculate total gas costs
2. Calculate compounding with this frequency
3. Calculate V_final = yield - gas costs
4. Keep the frequency that gives the best V_final

**Result:** You automatically get the optimal V_final without manually choosing h.

## 📈 Complete Formula

The final value is calculated as:

```
V_final = V_initial × IL_factor × (1 + r_harvest)^n - gas_costs
```

Where:
- `IL_factor = (2√r) / (1+r)`: Impermanent loss factor
- `r_harvest = (APY_total / 100 / 365) × (h/24)`: Rate per harvest
- `n = days / (h/24)`: Number of harvests
- `APY_total = APY_fees + APY_farming`: Total annual yield
- `gas_costs`: Transaction costs for harvesting

### APY Breakdown

**Trading Fees APY:**
```
APY_fees = (V_24h × 0.0017 × 365 / TVL_lp) × 100
```

**Farming Rewards APY:**
```
APY_farming = (14500 × 365 × w_pair_ratio × P_cake / TVL_stack) × 100
```

**Note:** PancakeSwap V2 emissions are **14,500 CAKE/day** (5,292,500/year).

## 🎓 Usage Examples

### Example 1: Stable Pool, Short Term

**Context:** WBNB-BUSD, $10,000 investment for 30 days, no expected price change.

```bash
npm run calc:final
```

```
V_initial: 10000
Days: 30
r: 1.0
V_24h: 5000000
TVL_lp: 50000000
w_pair_ratio: 0.05
P_cake: 2.5
TVL_stack: 40000000
P_gas: 3
P_BNB: 600

→ V_final = $10,064.75
→ Total Return: +0.65% over 30 days (~7.9% APY)
```

### Example 2: Volatile Pool, Medium Term

**Context:** ETH-BNB, $10,000 investment for 90 days, +25% expected increase.

```
V_initial: 10000
Days: 90
r: 1.25
V_24h: 8000000
TVL_lp: 60000000
w_pair_ratio: 0.08
P_cake: 2.5
TVL_stack: 50000000
P_gas: 3
P_BNB: 600

→ V_final = $10,195.80
→ Total Return: +1.96% over 90 days (~7.9% APY)
→ Impermanent Loss: -0.62% (offset by yields)
```

### Example 3: Low Liquidity Pool, High Yield

**Context:** ALT-BUSD, $5,000 investment for 60 days, -10% price drop.

```
V_initial: 5000
Days: 60
r: 0.9
V_24h: 200000
TVL_lp: 2000000
w_pair_ratio: 0.01
P_cake: 2.5
TVL_stack: 1500000
P_gas: 3
P_BNB: 600

→ V_final = $5,117.47
→ Total Return: +2.35% over 60 days (~14.3% APY)
→ Impermanent Loss: -0.14%
```

## 🆚 Function Comparison

| Function | Inputs | Output | Usage |
|----------|--------|--------|-------|
| `calculateOptimizedFinalValue()` | User inputs + On-chain data | **V_final (number)** | **Simple & fast** ✅ |
| `optimizeAndAnalyzeLPPosition()` | PoolData + days + r | Full object with metrics | Detailed analysis |
| `analyzeLPV2Position()` | PoolData + h | Complete breakdown | Debug & exploration |

**Recommendation:** Use `calculateOptimizedFinalValue()` to quickly get the final result.

## 📁 Project Files

```
monorepo/
├── agents/skills/
│   └── analyzePool-LPV2.ts          # calculateOptimizedFinalValue() function
├── scripts/
│   ├── calculate-final-value.ts      # Interactive calculator
│   ├── quick-test-final-value.ts     # Quick test with 3 scenarios
│   ├── test-lpv2-analysis.ts         # Full test suite
│   └── example-simple-usage.ts       # Detailed usage examples
└── package.json                      # npm scripts
```

## 🛠 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run calc:final` | Interactive calculator (recommended) |
| `npm run quick:final` | Quick test with 3 scenarios |
| `npm run example:lpv2` | Detailed examples with full analysis |
| `npm run test:lpv2` | Complete test suite |

## ❓ FAQ

### Q1: How do I get on-chain data?

**Answer:** Use these APIs:
- **DeFiLlama**: `V_24h`, `TVL_lp`, `TVL_stack`, `w_pair_ratio`
- **CoinGecko**: `P_cake`, `P_BNB`
- **BSCScan**: `P_gas` (gas price)

### Q2: Why is h optimized automatically?

**Answer:** The optimal frequency depends on yield and gas costs. Too frequent harvesting increases fees, too rare reduces compounding. The function tests 10 frequencies and picks the best.

### Q3: What if r changes during the period?

**Answer:** The model assumes total change equals `r`. If price fluctuates during the period but ends at `r`, IL is calculated based on final `r`. For more accurate predictions, split into multiple periods.

### Q4: What does a negative V_final mean?

**Answer:** If V_final < V_initial, losses (IL + gas) exceed gains (fees + farming). This can happen with:
- High IL (r far from 1.0)
- Low trading volume (few fees)
- Low farming rewards
- Very high gas costs

### Q5: Can I compare multiple pools?

**Answer:** Yes! Call `calculateOptimizedFinalValue()` for each pool with same `V_initial` and `days`, then compare V_final values.

```typescript
const pools = [poolA_data, poolB_data, poolC_data];
const results = pools.map(data => ({
  name: data.name,
  V_final: calculateOptimizedFinalValue(userInputs, data)
}));

// Sort by V_final descending
results.sort((a, b) => b.V_final - a.V_final);
console.log('Best pool:', results[0].name);
```

## 🎯 Recommended Use Cases

### ✅ Good Use

- Quickly compare multiple pools
- Calculate LP investment ROI
- Estimate net return after IL
- Find best yield opportunity

### ⚠️ Limitations

- Doesn't handle intra-period price variations
- Assumes constant APYs (in reality they fluctuate)
- Doesn't account for extraordinary events (hacks, depegs, etc.)
- Based on historical data (past performance ≠ future results)

## 📚 Further Reading

- **Complete documentation**: [LPV2-ANALYSIS.md](./LPV2-ANALYSIS.md)
- **French user guide**: [CALCULATEUR_SIMPLE.md](./CALCULATEUR_SIMPLE.md)
- **Original guide**: [GUIDE_UTILISATEUR_SIMPLE.md](./GUIDE_UTILISATEUR_SIMPLE.md)
- **Implementation summary**: [../IMPLEMENTATION_SUMMARY.md](../IMPLEMENTATION_SUMMARY.md)
- **Source code**: [analyzePool-LPV2.ts](../agents/skills/analyzePool-LPV2.ts)

## 🤝 Support

For questions or suggestions:
1. Check complete documentation
2. Review examples in `scripts/`
3. Run tests: `npm run test:lpv2`

---

**Last Updated:** 2024  
**Version:** 1.0.0  
**Author:** FlowCap Team
