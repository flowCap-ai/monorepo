# Lending Position Monte Carlo Analysis

Complete guide for analyzing DeFi lending positions with Monte Carlo simulation.

## Overview

This system analyzes lending (supplier) positions on protocols like Venus, Aave, and Compound using Monte Carlo simulation to estimate returns and risk.

**Key Features:**
- 📊 Historical utilization rate analysis  
- 💰 Interest rate model (Jump Rate / Two-Slope)
- ⚠️ Bad debt risk quantification
- 🎲 Monte Carlo simulation (1000+ scenarios)
- 🔄 Harvest frequency optimization
- 📈 Risk metrics (Sharpe ratio, VaR, max drawdown)

---

## Quick Start

### 1. Basic Usage

```bash
npm run run:lending
```

### 2. Edit Configuration

Open [agents/skills/run_lending.ts](../agents/skills/run_lending.ts) and modify the `CONFIG` object:

```typescript
const CONFIG = {
  V_INITIAL: 10_000,      // Supply $10,000
  PERIOD_DAYS: 30,        // for 30 days
  PROTOCOL: 'Venus',      // on Venus Protocol
  ASSET: 'USDT',          // supplying USDT
  NUM_SIMULATIONS: 1000   // 1000 Monte Carlo scenarios
};
```

### 3. View Results

Results are printed to console and saved as JSON in the `output/` directory.

---

## Parameters

### User Parameters (Constants in CONFIG)

| Parameter | Description | Example Values |
|-----------|-------------|----------------|
| `V_INITIAL` | Initial supply amount (USD) | `10000`, `50000`, `100000` |
| `PERIOD_DAYS` | Holding period (days) | `7`, `30`, `90`, `365` |
| `PROTOCOL` | Lending protocol | `"Venus"`, `"Aave"`, `"Compound"` |
| `ASSET` | Asset to supply | `"USDT"`, `"USDC"`, `"BNB"`, `"ETH"` |
| `CHAIN` | Blockchain network | `"BSC"`, `"Ethereum"`, `"Polygon"` |
| `NUM_SIMULATIONS` | Monte Carlo scenarios | `1000`, `5000`, `10000` |
| `HARVEST_FREQUENCY_DAYS` | Compounding frequency (optional) | `1`, `7`, `14`, `30`, or `undefined` for optimization |

### Estimated Parameters

These are **automatically estimated** from historical data:

#### 1. **Utilization Rate (U)**
- **What**: Percentage of supplied assets that are borrowed
- **Formula**: `U = Total Borrowed / Total Supplied`
- **Estimated from**: Historical DeFiLlama data (365 days)
- **Used for**: Calculating supply APY dynamically

#### 2. **Bad Debt Rate (δ delta)**
- **What**: Annual percentage of supply lost to bad debt
- **Causes**: Failed liquidations, oracle issues, flash crashes
- **Estimated from**: Historical liquidation failures and protocol risk
- **Typical values**:
  - Stablecoins on blue-chip protocols: 0.001% - 0.01% per year
  - Major assets (BTC/ETH): 0.01% - 0.1% per year
  - Volatile assets: 0.1% - 1% per year

### Optimized Parameter

#### Harvest Frequency (h)
- **What**: How often to compound interest (days)
- **Options**: 1 (daily), 7 (weekly), 14 (bi-weekly), 30 (monthly)
- **Optimization**: Script tests all frequencies and selects the one with highest expected return
- **Trade-off**: More frequent compounding vs. gas costs

---

## Interest Rate Models

### Jump Rate Model (Compound/Venus)

Most protocols use this model with a "kink" point:

```
if (U < kink):
  borrowAPY = baseRate + (U * multiplier)
else:
  borrowAPY = baseRate + (kink * multiplier) + ((U - kink) * jumpMultiplier)

supplyAPY = borrowAPY * U * (1 - reserveFactor)
```

**Example (Venus USDT):**
- Base Rate: 0%
- Multiplier: 4.8%
- Jump Multiplier: 69%
- Kink: 80%
- Reserve Factor: 5%

**APY at different utilizations:**
- U=50%: Borrow=2.4%, Supply=1.14%
- U=80%: Borrow=3.84%, Supply=2.92%
- U=90%: Borrow=10.74%, Supply=9.19%

---

## Core Formula

### V_final Calculation

```typescript
V_final = V_initial * (1 + supplyAPY * period)^n - gasCosts - badDebtLosses
```

Where:
- `n` = number of harvest periods
- `supplyAPY` = f(utilizationRate, interestRateModel)
- `badDebtLosses` ~ Bernoulli(δ, period)

### Monte Carlo Simulation

For each of 1000+ scenarios:
1. Generate random utilization rate U from historical distribution
2. Calculate supply APY = f(U, kinks)
3. Simulate compounding over harvest periods
4. Generate bad debt event (if any)
5. Subtract gas costs
6. Record final value

### Statistical Output

From all scenarios, calculate:
- **Mean**: Expected final value
- **Median**: 50th percentile outcome
- **Std Dev**: Volatility of outcomes
- **Percentiles**: 5th (worst case) and 95th (best case)
- **Risk Metrics**: Probability of loss, max drawdown, Sharpe ratio

---

## Example Scenarios

### Scenario 1: Stablecoin (Low Risk)

```typescript
const CONFIG = {
  V_INITIAL: 10_000,
  PERIOD_DAYS: 90,
  PROTOCOL: 'Venus',
  ASSET: 'USDT',
  CHAIN: 'BSC'
};
```

**Typical Results:**
- Expected Return: +0.5% - 1.5% (90 days)
- Annualized APY: 2% - 6%
- Bad Debt Risk: < 0.01%
- Probability of Loss: < 1%

### Scenario 2: Major Asset (Medium Volatility)

```typescript
const CONFIG = {
  V_INITIAL: 50_000,
  PERIOD_DAYS: 30,
  PROTOCOL: 'Aave',
  ASSET: 'ETH',
  CHAIN: 'Ethereum'
};
```

**Typical Results:**
- Expected Return: +0.2% - 0.8% (30 days)
- Annualized APY: 3% - 10%
- Bad Debt Risk: 0.01% - 0.1%
- Probability of Loss: 1% - 5%

### Scenario 3: Volatile Asset (High Risk/Reward)

```typescript
const CONFIG = {
  V_INITIAL: 20_000,
  PERIOD_DAYS: 180,
  PROTOCOL: 'Venus',
  ASSET: 'BNB',
  CHAIN: 'BSC'
};
```

**Typical Results:**
- Expected Return: +2% - 8% (180 days)
- Annualized APY: 4% - 16%
- Bad Debt Risk: 0.1% - 1%
- Probability of Loss: 5% - 15%

---

## Scripts Architecture

### Data Retrieval Scripts

#### 1. **GetUtilizationRateHistory.ts**
- Fetches historical utilization rate data
- **Sources**: DeFiLlama, protocol subgraphs
- **Output**: Statistics (mean, std, min, max) + time series

#### 2. **GetBadDebtHistory.ts**
- Analyzes bad debt risk for the asset
- **Logic**: Risk assessment based on protocol and asset type
- **Output**: Annualized bad debt rate (δ) + event history

#### 3. **GetKinks.ts**
- Retrieves interest rate model parameters
- **Includes**: Base rate, multipliers, kink points, reserve factor
- **Output**: Complete rate model + APY calculation functions

### Analysis Engine

#### 4. **analyzeLendingPosition.ts**
- Monte Carlo simulation engine
- **Features**: 
  - Random utilization generation
  - Bad debt event simulation
  - Harvest frequency optimization
  - Risk metrics calculation

### Execution Script

#### 5. **run_lending.ts**
- User-facing execution script
- **Workflow**:
  1. Fetch interest rate model
  2. Analyze utilization history
  3. Assess bad debt risk
  4. Run Monte Carlo simulation
  5. Display results + save JSON

---

## Output Format

### Console Output

```
═══════════════════════════════════════════════════════════════
LENDING POSITION MONTE CARLO ANALYSIS
═══════════════════════════════════════════════════════════════

Configuration:
  Protocol:        Venus
  Asset:           USDT
  Initial Supply:  $10,000
  Period:          30 days
  Simulations:     1000

... [Progress messages] ...

═══════════════════════════════════════════════════════════════
RESULTS
═══════════════════════════════════════════════════════════════

📈 Position Performance:
   Initial Value:        $10,000.00
   Expected Final Value: $10,045.20
   Expected Return:      $45.20 (0.45%)
   Annualized APY:       5.52%

📊 Monte Carlo Statistics:
   Mean:                 $10,045.20
   Median:               $10,044.80
   Std Deviation:        $12.30
   5th Percentile:       $10,018.50
   95th Percentile:      $10,068.90

💰 Yield Breakdown:
   Mean Supply APY:      5.64%
   Mean Utilization:     75%
   Bad Debt Losses:      $0.12

🔄 Compounding Strategy:
   Harvest Frequency:    Every 7 days
   Total Harvests:       4
   Total Gas Cost:       $1.50

⚠️  Risk Metrics:
   Probability of Loss:  0.50%
   Max Drawdown:         $-8.20
   Sharpe Ratio:         3.671
```

### JSON Output

Saved to `output/lending_analysis_<protocol>_<asset>_<timestamp>.json`:

```json
{
  "config": {
    "protocol": "Venus",
    "asset": "USDT",
    "initialSupply": 10000,
    "periodDays": 30
  },
  "interestRateModel": {
    "modelType": "JumpRate",
    "baseRatePerYear": 0,
    "multiplierPerYear": 0.048,
    "jumpMultiplierPerYear": 0.69,
    "kink": 0.8,
    "reserveFactor": 0.05
  },
  "utilizationStatistics": {
    "mean": 0.7523,
    "std": 0.0842,
    "min": 0.5210,
    "max": 0.9105
  },
  "badDebtStatistics": {
    "annualizedRate": 0.000085,
    "eventsPerYear": 0.5
  },
  "analysis": {
    "meanFinalValue": 10045.20,
    "stdFinalValue": 12.30,
    "totalReturnPercent": 0.45,
    "annualizedAPY": 5.52,
    "probabilityOfLoss": 0.005,
    "sharpeRatio": 3.671
  }
}
```

---

## Key Differences from LP Positions

### Lending vs LP

| Aspect | Lending Position | LP Position |
|--------|------------------|-------------|
| **Main Risk** | Bad debt, utilization volatility | Impermanent loss, volatility |
| **Yield Source** | Interest from borrowers | Trading fees + farming |
| **Capital Efficiency** | Full amount earns yield | Half in each token |
| **Complexity** | Medium (rate models) | High (IL math) |
| **Volatility** | Low (stables) to Medium | Medium to Very High |
| **Optimization** | Harvest frequency | Harvest frequency + price range (V3) |

---

## Risk Considerations

### 1. Protocol Risk
- **Smart contract bugs**: Venus hack (2023), Aave v1 issues
- **Mitigation**: Use audited protocols, diversify

### 2. Bad Debt Risk
- **Liquidation failures**: Flash crashes, oracle manipulation
- **Mitigation**: Supply stable/major assets, blue-chip protocols

### 3. Utilization Risk
- **High utilization**: May not be able to withdraw when U → 100%
- **Mitigation**: Monitor utilization trends, set alerts

### 4. Gas Cost Risk
- **Network congestion**: High gas prices eat into returns
- **Mitigation**: Optimize harvest frequency, use L2s

### 5. Oracle Risk
- **Price manipulation**: Can trigger unnecessary liquidations
- **Mitigation**: Choose protocols with robust oracles (Chainlink)

---

## Advanced Usage

### Custom Interest Rate Models

If your protocol isn't supported, add it to `GetKinks.ts`:

```typescript
const PROTOCOL_SPECIFIC_MODELS: Record<string, Partial<Record<string, InterestRateModel>>> = {
  YourProtocol: {
    USDT: {
      modelType: 'JumpRate',
      baseRatePerYear: 0.00,
      multiplierPerYear: 0.04,
      jumpMultiplierPerYear: 0.75,
      kink: 0.80,
      reserveFactor: 0.10
    }
  }
};
```

### Batch Analysis

Analyze multiple assets or durations:

```typescript
const assets = ['USDT', 'USDC', 'BUSD'];
const periods = [7, 30, 90, 365];

for (const asset of assets) {
  for (const period of periods) {
    // Update CONFIG and run analysis
  }
}
```

### Custom Bad Debt Parameters

Override automatic risk assessment in `GetBadDebtHistory.ts`:

```typescript
function assessRiskLevel(protocol: string, asset: string): 'low' | 'medium' | 'high' {
  // Your custom logic
  return 'low';
}
```

---

## FAQ

**Q: Why is my APY lower than shown on the protocol website?**

A: The simulation includes:
- Bad debt losses (protocol AMay not show this)
- Gas costs for compounding
- Utilization volatility (website shows current APY)

**Q: How accurate is the bad debt estimation?**

A: It's conservative. Real bad debt events are rare but can be significant. The simulation models historical probabilities + protocol risk factors.

**Q: Should I compound daily or monthly?**

A: The script optimizes this for you! Generally:
- **Daily**: Best for large positions (gas cost < 0.01% of position)
- **Weekly**: Good balance for most positions
- **Monthly**: Better for small positions to minimize gas

**Q: Can I use this for borrowing analysis?**

A: Not directly. This analyzes **supply** positions. Borrowing would need different logic (borrow APY, liquidation risk, collateral management).

**Q: What if my protocol/asset isn't supported?**

A: The system uses default models based on asset category (stablecoin, major, volatile). You can add protocol-specific models in `GetKinks.ts`.

---

## Troubleshooting

### Error: "Lending pool not found"

**Cause**: Protocol or asset name doesn't match DeFiLlama data

**Fix**: Check protocol spelling, try wrapped variant (WETH vs ETH)

### Error: "No historical data available"

**Cause**: Asset too new or not tracked

**Fix**: Use a similar established asset or add manual data

### Warning: "Using default model"

**Info**: Protocol-specific model not found, using generic

**Impact**: APY estimates may be less accurate (±1-2%

)

**Fix**: Add protocol model to `GetKinks.ts` if you have the parameters

---

## Next Steps

- ✅ Created lending position analysis system
- 🚧 TODO: Support multi-asset portfolios
- 🚧 TODO: Add borrowing position analysis
- 🚧 TODO: Implement collateralization strategies
- 🚧 TODO: Add lending vs LP comparison tool

---

## References

- [Compound Protocol Docs](https://docs.compound.finance/)
- [Aave V3 Docs](https://docs.aave.com/)
- [Venus Protocol Docs](https://docs.venus.io/)
- [DeFiLlama API](https://defillama.com/docs/api)

---

**Version**: 1.0.0  
**Last Updated**: February 2026  
**Maintainer**: FlowCap Team
