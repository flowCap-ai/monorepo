# Monte Carlo Simulation for LP Investments

Complete guide for running probabilistic risk analysis on liquidity provider positions using log-normal distribution.

---

## Quick Start

**Run simulation with predefined constants:**
```bash
npm run run:montecarlo
```

Edit constants in [agents/skills/run.ts](../agents/skills/run.ts) (lines 20-36):
```typescript
const CONFIG = {
  V_INITIAL: 100,          // Initial investment in USD
  PERIOD_DAYS: 365,        // Investment period in days
  ASSET_1: 'USDT',         // First asset
  ASSET_2: 'WBNB',         // Second asset
  NUM_SIMULATIONS: 1000,   // Number of scenarios
  HISTORICAL_DAYS: 365,    // Days of historical data
};
```

**Output:** Pure JSON with all metrics.

---

## Mathematical Foundation

### Probability Model

The simulation models price evolution using geometric Brownian motion:

**Log returns follow normal distribution:**
```
X_t = log(P_t / P_{t-1}) ~ Normal(μ, σ²)
```

Where:
- `μ` = Daily drift (average daily return)
- `σ` = Daily volatility (standard deviation of returns)
- `X_t` = Log return on day t

**Price ratio after T days:**
```
log(r) = Σ X_i ~ Normal(T×μ, T×σ²)
r = e^(log(r)) ~ LogNormal(T×μ, T×σ²)
```

Where `r = P_T / P_0` is the final price ratio.

### Parameter Estimation

Parameters are estimated from historical data using Maximum Likelihood Estimation (MLE):

**Daily parameters:**
```
μ̂ = (1/N) × Σ log(P_i / P_{i-1})
σ̂² = (1/N) × Σ (log(P_i / P_{i-1}) - μ̂)²
```

**Annualized parameters:**
```
μ_annual = μ × 365
σ_annual = σ × √365
```

### Monte Carlo Process

For each of 1000 scenarios:

1. **Generate random price ratio** using Box-Muller transform
2. **Calculate LP value** considering:
   - Impermanent Loss (IL)
   - Trading fees (from volume)
   - Farming rewards (CAKE tokens)
   - Gas costs
3. **Compute final value:** `V_final = V_initial + fees + farming - IL - gas`
4. **Store result**

Statistical analysis across all scenarios provides:
- Expected value (mean)
- Risk (standard deviation)
- Probability of loss
- Percentiles (5th, 25th, 50th, 75th, 95th)
- Value at Risk (VaR)

---

## Execution Flow

### Step 1: Fetch Historical Data
```typescript
const priceRatios = await getPriceRatioTimeSeries(
  CONFIG.ASSET_1, 
  CONFIG.ASSET_2, 
  CONFIG.HISTORICAL_DAYS
);
```
- Fetches from CoinGecko API
- Returns daily price ratios: `[P_0/P_1, P_1/P_2, ...]`
- **Throws error** if data unavailable

### Step 2: Estimate Parameters
```typescript
const params = estimateLogReturnParameters(priceRatios);
```
Returns:
```typescript
{
  mu: number,              // Daily drift
  sigma: number,           // Daily volatility
  annualizedMu: number,    // μ × 365
  annualizedSigma: number, // σ × √365
  sampleSize: number       // Number of data points
}
```

### Step 3: Fetch Pool Data
```typescript
const pools = await getPancakeSwapPoolData(1000);
const targetPool = pools.find(/* match assets */);
```
- Fetches from DeFiLlama API
- Gets TVL, volume, farming rewards
- **Throws error** if pool not found

### Step 4: Run Simulation
```typescript
const result = monteCarloSimulation(
  { V_initial: 100, days: 365 },
  poolParams,
  { mu, sigma },
  1000
);
```

### Step 5: Output JSON
```json
{
  "pair": "USDT-WBNB",
  "initialInvestment": 100,
  "period": 365,
  "expectedFinalValue": 120.50,
  "expectedReturn": 20.50,
  "expectedReturnPercent": 20.50,
  "annualizedAPY": 20.50,
  "risk": 15.20,
  "standardDeviation": 18.30,
  "medianVFinal": 118.45,
  "probabilityOfLoss": 0.15,
  "probabilityOfProfit": 0.85,
  "worstCase5Percentile": 85.30,
  "bestCase5Percentile": 160.20,
  "percentile25": 105.60,
  "percentile75": 135.40,
  "valueAtRisk5": 14.70,
  "mu": -0.000456,
  "sigma": 0.039,
  "dataSource": "Historical (CoinGecko)",
  "numSimulations": 1000
}
```

---

## Output Metrics Explained

### Return Metrics
- **expectedFinalValue**: Mean portfolio value across all scenarios
- **expectedReturn**: Mean profit/loss in USD
- **expectedReturnPercent**: Mean return as percentage
- **annualizedAPY**: Extrapolated yearly return

### Risk Metrics
- **risk**: Standard deviation of returns (uncertainty in profit)
- **standardDeviation**: Standard deviation of final values
- **probabilityOfLoss**: % of scenarios where you lose money
- **probabilityOfProfit**: % of scenarios where you profit

### Distribution Metrics
- **medianVFinal**: Typical outcome (50th percentile)
- **worstCase5Percentile**: Bottom 5% of scenarios
- **bestCase5Percentile**: Top 5% of scenarios
- **percentile25**: 25th percentile
- **percentile75**: 75th percentile
- **valueAtRisk5**: Maximum loss at 95% confidence

### Distribution Parameters
- **mu**: Daily drift (trend direction)
- **sigma**: Daily volatility (daily price movement)
- **dataSource**: Where parameters came from

---

## Risk Interpretation

### Probability of Loss
- **< 20%**: Low risk, favorable investment
- **20-40%**: Moderate risk, consider diversification
- **40-60%**: High risk, volatile pair
- **> 60%**: Very high risk, reconsider strategy

### Volatility (Annualized σ)
- **< 20%**: Stable pair (e.g., stablecoin pairs)
- **20-50%**: Moderate volatility
- **50-100%**: High volatility (typical crypto pairs)
- **> 100%**: Extreme volatility

### Coefficient of Variation
```
CV = (Standard Deviation / Expected Value) × 100
```
- **< 50%**: Good risk/return profile
- **50-100%**: Moderate risk per unit of return
- **> 100%**: High risk relative to expected return

---

## Configuration Examples

### Conservative (Stablecoin Pair)
```typescript
const CONFIG = {
  V_INITIAL: 10000,
  PERIOD_DAYS: 30,
  ASSET_1: 'USDT',
  ASSET_2: 'BUSD',
  NUM_SIMULATIONS: 1000,
  HISTORICAL_DAYS: 90,
};
```
Expected: Low IL, stable returns, P(Loss) < 10%

### Growth (Major Crypto)
```typescript
const CONFIG = {
  V_INITIAL: 5000,
  PERIOD_DAYS: 90,
  ASSET_1: 'ETH',
  ASSET_2: 'WBNB',
  NUM_SIMULATIONS: 1000,
  HISTORICAL_DAYS: 180,
};
```
Expected: Moderate IL, higher returns, P(Loss) 20-40%

### Speculative (Volatile Pair)
```typescript
const CONFIG = {
  V_INITIAL: 1000,
  PERIOD_DAYS: 180,
  ASSET_1: 'BTC',
  ASSET_2: 'ETH',
  NUM_SIMULATIONS: 1000,
  HISTORICAL_DAYS: 365,
};
```
Expected: High IL, high variance, P(Loss) 30-50%

---

## Error Handling

### Historical Data Failure
```
Error: Failed to retrieve historical data for ETH/BUSD.
CoinGecko API may be unavailable or the tokens may not be supported.
```
**Solutions:**
1. Check token symbols (use CoinGecko IDs)
2. Verify API is accessible
3. Try different token pair
4. Check token mapping in getPriceHistory.ts

### Pool Not Found
```
Error: Pool USDT-WBNB not found on PancakeSwap.
Please verify the asset names or try a different pair.
```
**Solutions:**
1. Verify pool exists on PancakeSwap
2. Try with/without 'W' prefix (WBNB vs BNB)
3. Check DeFiLlama for pool availability
4. Use different DEX if needed

---

## Technical Details

### Dependencies
```typescript
// From agents/skills/analyzePool-LPV2.ts
- monteCarloSimulation()
- estimateLogReturnParameters()

// From agents/skills/getPriceHistory.ts
- getPriceRatioTimeSeries()

// From agents/skills/getPoolData.ts
- getPancakeSwapPoolData()
```

### File Structure
```
agents/skills/
  ├── run.ts                  # Main execution script
  ├── analyzePool-LPV2.ts     # Monte Carlo engine
  ├── getPriceHistory.ts      # Historical data fetcher
  └── getPoolData.ts          # Pool parameter fetcher
```

### Customization Points

**1. Change simulation count:**
```typescript
NUM_SIMULATIONS: 500,  // Faster but less accurate
NUM_SIMULATIONS: 5000, // Slower but more accurate
```

**2. Adjust historical window:**
```typescript
HISTORICAL_DAYS: 30,   // Recent data only
HISTORICAL_DAYS: 365,  // Full year of data
```

**3. Modify investment horizon:**
```typescript
PERIOD_DAYS: 7,    // 1 week
PERIOD_DAYS: 30,   // 1 month
PERIOD_DAYS: 365,  // 1 year
```

---

## Interpreting Results

### Example Output Analysis
```json
{
  "expectedFinalValue": 120.50,
  "expectedReturn": 20.50,
  "probabilityOfLoss": 0.15,
  "worstCase5Percentile": 85.30,
  "bestCase5Percentile": 160.20
}
```

**Interpretation:**
- Expected to gain $20.50 (20.5% return)
- 15% chance of losing money (85% chance of profit)
- Worst case: Lose $14.70 (85.30 - 100)
- Best case: Gain $60.20 (160.20 - 100)

**Decision:** Favorable risk/return profile if you accept 15% chance of loss.

---

## Best Practices

### 1. Historical Data Window
- **Short-term (< 30 days)**: Use 30-90 days of history
- **Medium-term (30-180 days)**: Use 90-180 days
- **Long-term (> 180 days)**: Use 180-365 days

### 2. Number of Simulations
- **Quick test**: 100 simulations
- **Standard**: 1000 simulations (recommended)
- **High precision**: 5000-10000 simulations

### 3. Risk Management
- Never invest more than you can afford to lose
- If P(Loss) > 40%, reduce position size or choose safer pair
- Monitor volatility trends before investing
- Consider diversifying across multiple pools

---

## Theory Deep Dive

### Why Log-Normal Distribution?

Asset prices are modeled as log-normal because:
1. **Prices can't be negative** (log-normal is always positive)
2. **Returns are multiplicative** (log returns are additive)
3. **Empirically validated** (matches real market data)
4. **Analytically tractable** (closed-form solutions exist)

### Aggregation Property

Log returns aggregate linearly:
```
log(P_T / P_0) = log(P_1/P_0) + log(P_2/P_1) + ... + log(P_T/P_{T-1})
```

If each `log(P_i/P_{i-1}) ~ N(μ, σ²)`, then:
```
log(P_T / P_0) ~ N(T×μ, T×σ²)
```

This is why variance grows with time: `Var(log r) = T × σ²`

### Box-Muller Transform

To generate log-normal random variables:

1. Generate two uniform random numbers: `U₁, U₂ ~ Uniform(0,1)`
2. Transform to standard normal:
   ```
   Z₁ = √(-2 ln U₁) × cos(2π U₂)
   Z₂ = √(-2 ln U₁) × sin(2π U₂)
   ```
3. Scale to desired distribution:
   ```
   log(r) = T×μ + √(T×σ²) × Z₁
   r = e^(log(r))
   ```

---

## API Reference

### `monteCarloSimulation(userInputs, poolParams, distributionParams, numSims)`

**Parameters:**
- `userInputs`: `{ V_initial: number, days: number }`
- `poolParams`: Pool data from PancakeSwap
- `distributionParams`: `{ mu: number, sigma: number }`
- `numSims`: Number of scenarios (default: 1000)

**Returns:** `MonteCarloResult` object with all metrics

### `estimateLogReturnParameters(priceRatios)`

**Parameters:**
- `priceRatios`: Array of daily price ratios

**Returns:**
```typescript
{
  mu: number,
  sigma: number,
  annualizedMu: number,
  annualizedSigma: number,
  sampleSize: number
}
```

### `getPriceRatioTimeSeries(asset1, asset2, days)`

**Parameters:**
- `asset1`: First token symbol
- `asset2`: Second token symbol
- `days`: Number of days of history

**Returns:** `number[]` or `null` if failed

### `getPancakeSwapPoolData(limit)`

**Parameters:**
- `limit`: Max number of pools to fetch

**Returns:** Array of pool objects with `exogenousParams`

---

**Last Updated:** February 2026  
**Version:** 1.0  
**Script:** [agents/skills/run.ts](../agents/skills/run.ts)
