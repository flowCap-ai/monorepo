# V2 LP Position Analysis - Implementation Guide

## Overview

The `analyzePool-LPV2.ts` module implements a comprehensive mathematical model for analyzing Uniswap V2 style liquidity providing positions (like PancakeSwap V2). It calculates expected returns accounting for:

- **Impermanent Loss (IL)**: Price divergence impact on LP positions
- **Trading Fees**: Revenue from swap fees proportional to pool volume
- **Farming Rewards**: Incentive token emissions (e.g., CAKE rewards)
- **Compounding Effects**: Automated reinvestment at specified intervals
- **Gas Costs**: Transaction costs for harvest operations

## Mathematical Formula

The core formula implemented:

```
V_final = V_initial · IL_factor · (1 + r_harvest)^n - gas_costs
```

Where:
- `IL_factor = (2√r) / (1+r)` where `r = P_final / P_initial`
- `r_harvest = (APY_fees + APY_farming) · (harvest_freq / 365)`
- `n = days / (harvest_freq / 24)`
- `gas_costs = gas_per_tx · P_gas · P_native · ⌈n⌉`

### Component Breakdown

#### 1. Impermanent Loss

```typescript
IL_factor = (2 * √r) / (1 + r)
```

Examples:
- No price change (r=1.0): IL = 0%
- Price doubles (r=2.0): IL = -5.72%
- Price halves (r=0.5): IL = -5.72%
- Price quadruples (r=4.0): IL = -20%

#### 2. Trading Fee APY

```typescript
fee_APY = (V_24h · fee_tier) / (TVL_lp + V_initial) · 365 · 100
```

- `V_24h`: 24-hour trading volume
- `fee_tier`: 0.17% for PancakeSwap V2 (0.15% to LPs)
- `TVL_lp`: Total pool liquidity

#### 3. Farming Reward APY

```typescript
farming_APY = (annual_emissions · w_ratio · P_reward) / (TVL_staked + V_initial) · 100
```

- `annual_emissions`: 5,292,500 CAKE/year for PancakeSwap (14,500 CAKE/day × 365)
- `w_ratio`: Pool weight (share of total emissions)
- `P_reward`: CAKE price in USD

#### 4. Gas Costs

```typescript
gas_cost = (gas_units · gas_price_gwei / 1e9) · P_BNB · num_transactions
```

Default: 730 gas units per harvest transaction

## Usage Examples

### Basic Analysis

```typescript
import { analyzeLPV2Position } from './agents/skills/analyzePool-LPV2.js';
import type { PoolData } from './agents/skills/getPoolData.js';

// Example: USDT-BUSD stable pair
const poolData: PoolData = {
  protocol: 'pancakeswap',
  poolId: 'pancakeswap-usdt-busd',
  type: 'lp-farm',
  assets: ['USDT', 'BUSD'],
  address: '0x7EFaEf62fDdCCa950418312c6C91Aef321375A00',
  name: 'USDT-BUSD LP',
  isActive: true,
  version: 'v2',
  
  exogenousParams: {
    V_initial: 1000,           // $1000 investment
    V_24h: 5_000_000,          // $5M daily volume
    TVL_lp: 50_000_000,        // $50M liquidity
    w_pair_ratio: 0.02,        // 2% of farm rewards
    P_cake: 2.50,              // CAKE at $2.50
    TVL_stack: 40_000_000,     // $40M staked
    P_gas: 3,                  // 3 Gwei
    P_BNB: 600,                // BNB at $600
  },
};

// Analyze with default settings (30 days, daily compounding)
const analysis = await analyzeLPV2Position(poolData);

console.log(`Expected return: $${analysis.totalReturn} (${analysis.totalReturnPercent}%)`);
console.log(`Annualized APY: ${analysis.annualizedAPY}%`);
console.log(`Risk level: ${analysis.riskLevel}`);
```

### Custom Configuration

```typescript
// Analyze 90-day position with 6-hour compounding
const analysis = await analyzeLPV2Position(poolData, {
  days: 90,                       // 90-day holding period
  harvestFrequencyHours: 6,       // Compound every 6 hours
  priceChangeRatio: 1.25,         // Expect 25% price increase
  gasPerTransaction: 800,         // Custom gas estimate
  includeIL: true,                // Include IL (default: true)
});
```

### Scenario Analysis

```typescript
// Compare different price change scenarios
const scenarios = [
  { ratio: 1.0, label: 'No change' },
  { ratio: 1.1, label: '+10%' },
  { ratio: 0.9, label: '-10%' },
  { ratio: 1.5, label: '+50%' },
  { ratio: 0.5, label: '-50%' },
];

for (const scenario of scenarios) {
  const analysis = await analyzeLPV2Position(poolData, {
    priceChangeRatio: scenario.ratio,
  });
  
  console.log(`${scenario.label}: ${analysis.totalReturnPercent.toFixed(2)}%`);
  console.log(`  IL: ${analysis.impermanentLoss.toFixed(2)}%`);
  console.log(`  Net: ${(analysis.totalReturnPercent + analysis.impermanentLoss).toFixed(2)}%\n`);
}
```

## Output Structure

```typescript
interface LPV2Analysis {
  // Core yield metrics
  expectedValue: number;           // $1,023.45
  totalReturn: number;             // $23.45
  totalReturnPercent: number;      // 2.35%
  annualizedAPY: number;           // 28.74%
  
  // Component breakdown
  impermanentLoss: number;         // -1.23%
  tradingFeeAPY: number;           // 12.5%
  farmingRewardAPY: number;        // 18.3%
  totalGasCost: number;            // $0.12
  
  // Optimal strategy
  optimalHarvestFrequency: number; // 24 hours
  breakEvenDays: number;           // 0.8 days
  
  // Risk assessment
  riskScore: number;               // 85/100
  riskLevel: 'low';                // low | medium | high | critical
  warnings: string[];              // ["Low TVL - potential liquidity risk"]
  
  // Market conditions
  volumeToTVLRatio: number;        // 0.1 (10% daily turnover)
  utilizationRate: number;         // 0.8 (80% of LP is farmed)
  
  // Sensitivity analysis
  priceChangeImpact: {
    noChange: number;              // 2.35%
    up10: number;                  // 1.82%
    down10: number;                // 1.82%
    up25: number;                  // 0.95%
    down25: number;                // 0.95%
  };
}
```

## Key Features

### 1. Comprehensive Yield Calculation

- Separates trading fees from farming rewards
- Accounts for impermanent loss across different price scenarios
- Includes gas cost optimization

### 2. Risk Assessment

Evaluates pools based on:
- **TVL**: Low liquidity = high risk
- **Volume/TVL ratio**: Trading efficiency
- **Asset types**: Stablecoin pairs = lower risk
- **Farming participation**: Staked TVL vs LP TVL

Risk levels:
- **Low (80-100)**: Blue-chip pools, high liquidity
- **Medium (60-79)**: Established pools, moderate risk
- **High (40-59)**: Newer pools, lower liquidity
- **Critical (<40)**: Very risky, potential rug pull indicators

### 3. Optimization Features

#### Optimal Harvest Frequency
Automatically calculates the best compounding interval that maximizes `(yield - gas_costs)`

```typescript
const optimalFreq = calculateOptimalHarvestFrequency(
  investment,
  totalAPY,
  days,
  gasPerTx,
  gasPriceGwei,
  bnbPrice
);
```

Tests: 1h, 2h, 4h, 6h, 8h, 12h, 24h, 48h, 72h, 168h intervals

#### Break-even Analysis
Calculates minimum days needed for yield to cover gas costs

```typescript
const breakEven = calculateBreakEvenDays(
  investment,
  totalAPY,
  harvestFreq,
  gasPerTx,
  gasPriceGwei,
  bnbPrice
);
```

### 4. Sensitivity Analysis

Automatically evaluates 5 price change scenarios:
- No change (r=1.0)
- ±10% (r=1.1, r=0.9)
- ±25% (r=1.25, r=0.75)

Helps understand IL risk for volatile pairs.

## Integration with FlowCap Agent

### In OpenClaw Tools

```typescript
// agents/openclaw-tools.ts
import { analyzeLPV2Position } from './skills/analyzePool-LPV2.js';

export const analyzePoolV2Tool: Tool = {
  name: 'analyzePoolV2',
  description: 'Analyze a V2 LP position with comprehensive yield and risk metrics',
  
  async execute(params: { 
    poolData: PoolData; 
    days?: number; 
    priceChangeRatio?: number;
  }) {
    const analysis = await analyzeLPV2Position(params.poolData, {
      days: params.days || 30,
      priceChangeRatio: params.priceChangeRatio || 1.0,
    });
    
    return {
      success: true,
      data: analysis,
    };
  },
};
```

### In Agent Decision Logic

```typescript
// Example: Agent decides whether to enter position
async function evaluateOpportunity(poolData: PoolData) {
  const analysis = await analyzeLPV2Position(poolData, {
    days: 30,
    priceChangeRatio: 1.0, // Assume no price change
  });
  
  // Decision criteria
  const minAPY = 15; // Minimum 15% APY after IL
  const maxRiskLevel = 'medium';
  
  if (analysis.annualizedAPY >= minAPY && 
      analysis.riskLevel <= maxRiskLevel &&
      analysis.totalReturn > analysis.totalGasCost * 2) {
    return {
      action: 'ENTER',
      expectedReturn: analysis.totalReturnPercent,
      warnings: analysis.warnings,
    };
  }
  
  return {
    action: 'SKIP',
    reason: 'Does not meet risk/reward criteria',
  };
}
```

## Testing

Run the comprehensive test suite:

```bash
# Install dependencies first
npm install

# Run V2 LP analysis tests
npm run test:lpv2
# or manually:
tsx scripts/test-lpv2-analysis.ts
```

The test suite includes:
1. **Stable pair analysis** (USDT-BUSD)
2. **Volatile pair scenarios** (BNB-ETH with price changes)
3. **Low liquidity pool risk assessment**
4. **Harvest frequency optimization**

## Constants & Defaults

```typescript
// PancakeSwap V2 specific
const PANCAKESWAP_V2_FEE_TIER = 0.0017;      // 0.17% (LP gets 0.15%)
const PANCAKESWAP_DAILY_EMISSIONS = 14_500;  // 14,500 CAKE/day
const PANCAKESWAP_ANNUAL_EMISSIONS = PANCAKESWAP_DAILY_EMISSIONS * 365; // 5,292,500 CAKE/year

// Defaults
const DEFAULT_GAS_PER_TX = 730;              // Gas units
const DEFAULT_HARVEST_FREQ_HOURS = 24;       // Daily compounding
const DEFAULT_HOLDING_DAYS = 30;             // 30-day analysis
```

## Requirements

The pool must have `exogenousParams` populated with:
- `V_initial`: User investment (USD)
- `V_24h`: 24h volume (USD)
- `TVL_lp`: Pool liquidity (USD)
- `w_pair_ratio`: Pool weight (0-1)
- `P_cake`: CAKE price (USD)
- `TVL_stack`: Staked TVL (USD)
- `P_gas`: Gas price (Gwei)
- `P_BNB`: BNB price (USD)

These are automatically fetched by `getPoolData.ts` from:
- DeFiLlama API (volume, TVL)
- CoinGecko API (CAKE, BNB prices)
- Owlracle API (gas prices)

## Limitations & Future Improvements

### Current Limitations
1. Assumes constant APY (doesn't model APY decay over time)
2. Price ratio `r` is static (doesn't model dynamic price movements)
3. Gas costs assume fixed gas price (no EIP-1559 dynamics)
4. Farming emissions assumed constant (doesn't account for emission schedules)

### Future Enhancements
1. **Dynamic APY modeling**: Account for TVL changes affecting APY
2. **Volatility-based IL**: Use historical volatility for IL estimates
3. **Multi-period optimization**: Find optimal entry/exit points
4. **Correlation analysis**: Better IL estimates for correlated pairs
5. **V3 support**: Concentrated liquidity position analysis

## References

- [Uniswap V2 Whitepaper](https://uniswap.org/whitepaper.pdf)
- [Impermanent Loss Calculator](https://dailydefi.org/tools/impermanent-loss-calculator/)
- [PancakeSwap Documentation](https://docs.pancakeswap.finance/)
- DeFi Liquidity Mining Analysis (Liquidity Providing Position - V2.pdf)

## License

MIT

---

**Built for FlowCap by HashFox Labs**
