# CustoFi Monorepo

Complete setup for CustoFi - Autonomous DeFi Wealth Manager on BNB Chain

## Overview

CustoFi is an AI-powered DeFi yield optimizer that autonomously manages liquidity provider (LP) positions on PancakeSwap V2. It uses account abstraction (ERC-4337) with Biconomy for gasless transactions and session keys for secure automated trading.

## Features

- **V2 LP Position Analysis**: Mathematical modeling of impermanent loss, trading fees, and farming rewards
- **Monte Carlo Simulation**: Run 1000 scenarios to estimate expected returns, risk, and probability distribution
- **Historical Price Data**: Automatically retrieve real historical prices from CoinGecko to calculate price ratios
- **Harvest Frequency Optimization**: Tests 10 different harvest frequencies to maximize returns
- **On-Chain Data Integration**: Auto-fetch real pool data (TVL, volume, staking rewards) from DeFiLlama and DexScreener
- **Risk Assessment**: Calculate expected IL based on historical price movements and probability distributions
- **Session Keys**: Secure automated trading with time-limited permissions
- **Dashboard**: Real-time monitoring with transaction history

## Quick Start

### Installation

```bash
npm install
```

### Available Scripts

#### LP Calculators

```bash
# Monte Carlo simulation - 1000 scenarios with risk analysis (BEST FOR RISK ASSESSMENT)
npm run calc:montecarlo

# Interactive calculator with historical price data (RECOMMENDED)
npm run calc:historical

# Auto-fetch on-chain pool data (manual r input)
npm run calc:onchain

# Manual input calculator
npm run calc:final

# Quick test with pre-configured scenarios
npm run quick:final

# Detailed step-by-step calculation breakdown
npm run debug:calc
```

#### Testing

```bash
# Test Monte Carlo simulation
npm run test:montecarlo

# Test historical price retrieval
npm run test:pricehistory

# Test LP V2 analysis
npm run test:lpv2

# Run all tests
npm test
```

## Documentation

- **[Monte Carlo Simulation Guide](docs/MONTE_CARLO_GUIDE.md)** - Complete guide to probabilistic risk analysis
- **[Historical Prices Guide](docs/HISTORICAL_PRICES_GUIDE.md)** - How to use historical price data for backtesting
- **[On-Chain Calculator Guide](docs/GUIDE_CALCULATEUR_ONCHAIN.md)** - French guide for automated pool data fetching
- **[Pool Data Parameters](POOL_DATA_EXOGENOUS_PARAMS.md)** - Explanation of all mathematical parameters

## Example Usage

### Calculate V_final with Historical Data

```bash
npm run calc:historical
```

**Interactive prompts:**
1. Select a pool from top 20 by TVL
2. Enter initial investment amount
3. Enter investment period (days)
4. System automatically fetches historical prices
5. Calculates optimized V_final

**Example output:**
```
Historical Price Analysis (90 days):
  ETH: $3021.30 → $2011.68 (-33.42%)
  BUSD: $0.9983 → $1.0007 (+0.24%)
  
📊 Calculated r = 0.664233
📉 Historical IL = -2.06%

💰 V_final = $9,456.23
   Total return: -$543.77 (-5.44%)
```

### Monte Carlo Risk Analysis

```bash
npm run calc:montecarlo
```

**What it does:**
- Fetches historical prices to estimate volatility (μ, σ)
- Runs 1000 simulations with different price scenarios
- Provides expected return, risk, and probability distribution

**Example output:**
```
Distribution Parameters (from 90 days of ETH-BUSD):
  Daily μ (drift):       -0.4560%
  Daily σ (volatility):   3.90%
  Annualized volatility:  74.57%

MONTE CARLO RESULTS (1000 simulations):
═══════════════════════════════════════════════════════════

Expected Value (Mean):    $10,376
Mean Return:              +$376 (+3.76%)
Risk (Std Dev):           $429
Probability of Loss:      16.0%

Distribution:
  5th percentile:         $9,525 (worst 5%)
  Median:                 $10,516
  95th percentile:        $10,757 (best 5%)

⚠️ MODERATE RISK: 16% probability of loss
```

**Key insights:**
- **Expected return**: $376 average across 1000 scenarios
- **Risk**: $429 standard deviation (41% of mean return)
- **Worst case (5%)**: Lose $475
- **Best case (5%)**: Gain $757

### Programmatic Usage

**Historical Price Data:**
```typescript
import { getPriceRatioForPeriod } from './agents/skills/getPriceHistory.js';
import { calculateOptimizedFinalValue } from './agents/skills/analyzePool-LPV2.js';

// Get historical price ratio
const priceData = await getPriceRatioForPeriod("ETH", "BUSD", 90);

// Calculate final value
const V_final = calculateOptimizedFinalValue(
  {
    V_initial: 10000,
    days: 90,
    r: priceData.priceRatio // From real historical data
  },
  poolExogenousParams
);

console.log(`Expected return: $${V_final.toFixed(2)}`);
```

**Monte Carlo Simulation:**
```typescript
import { 
  monteCarloSimulation,
  estimateLogReturnParameters,
} from './agents/skills/analyzePool-LPV2.js';
import { getPriceRatioTimeSeries } from './agents/skills/getPriceHistory.js';

// 1. Get historical price ratios
const priceRatios = await getPriceRatioTimeSeries('ETH', 'BUSD', 90);

// 2. Estimate distribution parameters (μ, σ)
const params = estimateLogReturnParameters(priceRatios);

// 3. Run 1000 simulations
const result = monteCarloSimulation(
  { V_initial: 10000, days: 90 },
  poolExogenousParams,
  { mu: params.mu, sigma: params.sigma },
  1000
);

// 4. Analyze results
console.log(`Expected return: $${result.meanReturn.toFixed(2)}`);
console.log(`Risk (std dev): $${result.stdDevReturn.toFixed(2)}`);
console.log(`P(Loss): ${(result.probabilityOfLoss * 100).toFixed(1)}%`);
console.log(`Worst case (5%): $${result.percentile5.toFixed(2)}`);
console.log(`Best case (5%): $${result.percentile95.toFixed(2)}`);
```

## Project Structure

```
monorepo/
├── agents/
│   ├── skills/
│   │   ├── analyzePool-LPV2.ts       # Core LP calculation engine
│   │   ├── getPriceHistory.ts        # Historical price retrieval
│   │   ├── getPoolData.ts            # On-chain data fetcher
│   │   ├── getPools.ts               # Pool discovery
│   │   ├── execSwap.ts               # Trade execution
│   │   └── analyzePool.ts            # Pool analysis
│   ├── openclaw-runner.ts            # AI agent runner
│   └── config.yaml                   # Agent configuration
├── dashboard/                         # Next.js dashboard
│   ├── components/
│   │   ├── AgentDashboard.tsx        # Main dashboard
│   │   ├── RiskSelector.tsx          # Risk profile selector
│   │   └── WalletConnect.tsx         # Wallet integration
│   └── hooks/
│       ├── useBiconomy.ts            # Biconomy AA integration
│       └── useSessionKey.ts          # Session key management
├── scripts/
│   ├── calculate-with-historical-prices.ts  # Interactive calculator with history
│   ├── calculate-with-onchain-data.ts       # On-chain data calculator
│   ├── test-price-history.ts                # Historical price tests
│   └── debug-calculation.ts                  # Detailed breakdown
├── docs/
│   ├── HISTORICAL_PRICES_GUIDE.md    # Historical data guide
│   └── GUIDE_CALCULATEUR_ONCHAIN.md  # French on-chain guide
└── contracts/
    └── SessionValidator.sol           # Session key validator

```

## Core Formula

The V_final calculation models an LP position as:

```
V_final = V_initial × IL_factor × (1 + r_harvest)^n - gas_costs
```

Where:
- **IL_factor** = `(2√r) / (1+r)` - Impermanent loss multiplier
- **r** = `P_final / P_initial` - Price ratio (from historical data or user input)
- **r_harvest** = Trading fee APY + Farming APY (if staking pool exists)
- **n** = Number of harvest periods
- **gas_costs** = Total gas fees for harvesting

The system tests 10 harvest frequencies (1h to 168h) and selects the optimal one.

## API Integrations

- **CoinGecko**: Historical price data for 20+ tokens
- **DeFiLlama**: Pool TVL and volume data
- **DexScreener**: Real-time pool metrics
- **Owlracle**: BSC gas price estimates
- **Biconomy**: Account abstraction and gasless transactions

## Rate Limits

⚠️ **CoinGecko Free Tier**: 10-12 requests/minute

If you see rate limit errors:
```
⚠️ CoinGecko rate limit exceeded. Wait a few minutes or use API key.
```

**Solution**: Wait 60 seconds between test runs, or upgrade to CoinGecko Pro API.

## Development

```bash
# Build TypeScript
npm run build

# Run agent in development mode
npm run agent:dev

# Start dashboard
cd dashboard && npm run dev

# Format code
npm run format

# Lint
npm run lint
```

## Constants

- **PancakeSwap Daily Emissions**: 14,500 CAKE/day (5,292,500/year)
- **Trading Fee**: 0.17% (0.15% to LPs + 0.02% treasury)
- **Network**: BNB Chain (BSC)

## Testing

Run comprehensive tests:

```bash
# All tests
npm test

# LP V2 analysis tests
npm run test:lpv2

# Historical price tests
npm run test:pricehistory
```

## License

MIT

## References

- [PancakeSwap V2 Docs](https://docs.pancakeswap.finance/)
- [Impermanent Loss Explained](https://finematics.com/impermanent-loss-explained/)
- [Biconomy Account Abstraction](https://docs.biconomy.io/)
- [CoinGecko API](https://www.coingecko.com/en/api/documentation)
