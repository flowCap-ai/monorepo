# LP Position Analysis - Implementation Status

## Available Analysis Modules

### 1. `analyzePool.ts` (Existing)
**Purpose**: General-purpose pool analysis for all protocol types

**Supported Protocols**:
- Venus Protocol (lending)
- PancakeSwap (basic LP analysis)
- Lista DAO (lending + liquid staking)
- Alpaca Finance

**Features**:
- Fetches on-chain APY data
- Calculates risk scores
- Provides TVL, volume, utilization metrics
- Real-time data from APIs and blockchain

**Use Cases**:
- Quick pool discovery and filtering
- Real-time APY monitoring
- Protocol comparison
- Risk assessment for agent decisions

**Example**:
```typescript
import analyzePool from './analyzePool.js';

const analysis = await analyzePool.analyzePool(
  'venus-usdt',
  '0xfD5840Cd36d94D7229439859C0112a4185BC0255'
);

console.log(`APY: ${analysis.apy}%`);
console.log(`TVL: $${analysis.tvl}`);
console.log(`Risk: ${analysis.riskLevel}`);
```

---

### 2. `analyzePool-LPV2.ts` (New - Mathematical Model)
**Purpose**: Deep mathematical analysis of V2 LP positions

**Supported Protocols**:
- PancakeSwap V2
- Any Uniswap V2 clone on BSC

**Features**:
- **Impermanent Loss calculation** with price scenarios
- **Trading fee APY** based on volume/TVL
- **Farming reward APY** with token emissions
- **Compounding optimization** (harvest frequency)
- **Gas cost modeling** for profitability
- **Sensitivity analysis** (±10%, ±25% price changes)
- **Break-even period** calculation

**Use Cases**:
- Position entry/exit decisions
- Expected returns over time periods
- IL risk assessment for volatile pairs
- Harvest strategy optimization
- Comparing stable vs volatile pairs

**Example**:
```typescript
import { analyzeLPV2Position } from './analyzePool-LPV2.js';

const analysis = await analyzeLPV2Position(poolData, {
  days: 30,
  harvestFrequencyHours: 24,
  priceChangeRatio: 1.0, // No price change
});

console.log(`Expected return: ${analysis.totalReturnPercent}%`);
console.log(`Annualized APY: ${analysis.annualizedAPY}%`);
console.log(`IL impact: ${analysis.impermanentLoss}%`);
console.log(`Optimal harvest: Every ${analysis.optimalHarvestFrequency}h`);
```

---

## When to Use Which Module

### Use `analyzePool.ts` when:
- ✅ Scanning for opportunities across protocols
- ✅ Getting current real-time APY
- ✅ Checking Venus lending markets
- ✅ Quick risk assessment
- ✅ Need on-chain verification of rates

### Use `analyzePool-LPV2.ts` when:
- ✅ Deep analysis of PancakeSwap V2 LP positions
- ✅ Calculating expected returns over time
- ✅ Evaluating IL risk with price scenarios
- ✅ Optimizing harvest frequency
- ✅ Comparing profitability after gas costs
- ✅ Need precise mathematical projections

---

## Integration Example: Complete Flow

```typescript
import analyzePool from './analyzePool.js';
import { analyzeLPV2Position } from './analyzePool-LPV2.js';
import { getAllPoolData } from './getPoolData.js';

// Step 1: Get all pools with exogenous parameters
const allPools = await getAllPoolData(1000); // $1000 investment

// Step 2: Quick filter using analyzePool
const topPools = [];
for (const pool of allPools) {
  if (pool.protocol === 'pancakeswap' && pool.type === 'lp-farm') {
    const quickAnalysis = await analyzePool.analyzePool(pool.poolId, pool.address);
    
    // Filter: High APY, Low Risk, Good liquidity
    if (quickAnalysis.apy > 20 && 
        quickAnalysis.riskLevel === 'low' &&
        quickAnalysis.tvl > 1_000_000) {
      topPools.push({ pool, quickAnalysis });
    }
  }
}

// Step 3: Deep analysis on top candidates with V2 model
for (const { pool, quickAnalysis } of topPools) {
  console.log(`\nDetailed analysis: ${pool.name}`);
  
  // Mathematical projection
  const deepAnalysis = await analyzeLPV2Position(pool, {
    days: 30,
    harvestFrequencyHours: 24,
  });
  
  console.log(`  Quick APY: ${quickAnalysis.apy}%`);
  console.log(`  Projected APY (after IL & gas): ${deepAnalysis.annualizedAPY}%`);
  console.log(`  Expected 30-day return: $${deepAnalysis.totalReturn}`);
  console.log(`  IL risk (if +25%): ${deepAnalysis.priceChangeImpact.up25}%`);
  console.log(`  IL risk (if -25%): ${deepAnalysis.priceChangeImpact.down25}%`);
  console.log(`  Risk level: ${deepAnalysis.riskLevel}`);
  
  // Decision: Make sure the deep analysis confirms profitability
  if (deepAnalysis.annualizedAPY > 15 && 
      deepAnalysis.totalReturn > deepAnalysis.totalGasCost * 3) {
    console.log(`  ✅ ENTER POSITION`);
  } else {
    console.log(`  ❌ SKIP - Not profitable enough after costs`);
  }
}
```

---

## Comparison Table

| Feature | `analyzePool.ts` | `analyzePool-LPV2.ts` |
|---------|------------------|----------------------|
| **Real-time APY** | ✅ On-chain data | ❌ Uses model |
| **Impermanent Loss** | ❌ Not calculated | ✅ Full IL model |
| **Trading Fees** | ✅ From API | ✅ Calculated |
| **Farming Rewards** | ✅ From API | ✅ Calculated |
| **Time Projections** | ❌ Current only | ✅ Any period |
| **Gas Costs** | ❌ Not included | ✅ Full modeling |
| **Harvest Optimization** | ❌ No | ✅ Yes |
| **Price Scenarios** | ❌ No | ✅ ±10%, ±25% |
| **Venus Support** | ✅ Yes | ❌ No |
| **Lista Support** | ✅ Yes | ❌ No |
| **PancakeSwap V2** | ✅ Basic | ✅ Advanced |
| **Data Source** | APIs + On-chain | Mathematical |
| **Speed** | Fast (API calls) | Very fast (math) |
| **Accuracy** | Current snapshot | Projected model |

---

## Future Roadmap

### Planned Modules

1. **`analyzePool-LPV3.ts`**
   - Uniswap V3 / PancakeSwap V3 concentrated liquidity
   - Range optimization
   - Out-of-range risk

2. **`analyzePool-Lending.ts`**
   - Venus/Aave lending optimization
   - Borrow APY vs Supply APY
   - Liquidation risk modeling
   - Collateral factor analysis

3. **`analyzePool-LiquidStaking.ts`**
   - Lista slisBNB, Binance staking derivatives
   - Validator performance
   - Unstaking periods
   - Slashing risk

4. **`analyzePool-Vault.ts`**
   - Alpaca Finance leveraged yield farming
   - Auto-compounding vaults
   - Leverage risk modeling

---

## Contributing

When adding new analysis modules:

1. **Namespace clearly**: Use `analyzePool-{Type}.ts` naming
2. **Export interfaces**: Make result types reusable
3. **Document formulas**: Include mathematical explanations
4. **Add tests**: Create `test-{module}.ts` script
5. **Update this README**: Add to comparison table

---

## Questions?

- **"Why two separate modules?"** 
  - `analyzePool.ts` = Real-time data (what IS)
  - `analyzePool-LPV2.ts` = Mathematical projection (what WILL BE)
  
- **"Which is more accurate?"**
  - For **current APY**: Use `analyzePool.ts` (real data)
  - For **future returns**: Use `analyzePool-LPV2.ts` (includes IL, gas, compounding)

- **"Can I use both?"**
  - Yes! Use `analyzePool.ts` for discovery, then `analyzePool-LPV2.ts` for deep analysis (see integration example above)

---

**Last Updated**: February 15, 2026  
**Maintainer**: HashFox Labs
