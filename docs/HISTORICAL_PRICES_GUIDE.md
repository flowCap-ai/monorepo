# Historical Price Data Guide

## Overview

FlowCap now automatically retrieves historical cryptocurrency prices to calculate the price ratio (`r`) from real market data instead of manual estimation. This enables:

- **Backtesting**: Analyze how an LP position would have performed historically
- **Accurate IL calculation**: Based on actual price movements
- **Risk analysis**: Understand historical volatility for asset pairs
- **Better predictions**: Use real data instead of guessing future price ratios

## Available Scripts

### 1. Interactive Calculator with Historical Prices
```bash
npm run calc:historical
```

**What it does:**
1. Fetches all PancakeSwap pools (top 20 by TVL)
2. You select a pool
3. Enter investment amount and period (days)
4. **Automatically retrieves historical prices** for the pair
5. Calculates `r` from real data
6. Computes optimized `V_final`

**Example Output:**
```
Historical Price Analysis:
═══════════════════════════════════════════════════════════════
ETH:
  90 days ago: $3021.30
  Current:     $2011.68
  Change:      -33.42%

BUSD:
  90 days ago: $0.9983
  Current:     $1.0007
  Change:      +0.24%

📊 Calculated Price Ratio: r = 0.664233
📉 Historical IL: -2.06%
```

### 2. Test Historical Price Functionality
```bash
npm run test:pricehistory
```

Runs 5 test scenarios:
- Individual asset price history (30 days)
- ETH-BUSD price ratio (90 days)
- BNB-BUSD comparison across 7/30/90/180 days
- Complete IL analysis for ETH-BNB
- Custom date range (Jan 1, 2024 to now)

### 3. Manual Calculator (Existing)
```bash
npm run calc:final      # Manual r input
npm run calc:onchain    # Auto-fetch pool data but manual r
```

## How It Works

### Price Ratio Calculation

For an LP pair like ETH-BUSD over 90 days:

1. **Fetch historical prices** from CoinGecko
   - ETH: 91 daily price points
   - BUSD: 91 daily price points

2. **Calculate price ratio**
   ```
   r = (P_ETH_final / P_BUSD_final) / (P_ETH_initial / P_BUSD_initial)
   ```

3. **Compute impermanent loss**
   ```
   IL_factor = (2√r) / (1+r)
   IL_percent = (IL_factor - 1) × 100%
   ```

4. **Use in V_final calculation**
   ```typescript
   const V_final = calculateOptimizedFinalValue(
     { V_initial: 10000, days: 90, r: 0.6642 }, // r from historical data
     poolData
   );
   ```

## Supported Assets

The system supports 20+ major cryptocurrencies via CoinGecko:

| Asset | CoinGecko ID | Common Pairs |
|-------|--------------|--------------|
| BTC   | bitcoin      | BTC-ETH, BTC-BUSD |
| ETH   | ethereum     | ETH-BNB, ETH-USDT |
| BNB   | binancecoin  | BNB-BUSD, BNB-CAKE |
| CAKE  | pancakeswap-token | CAKE-BNB |
| USDT  | tether       | ETH-USDT |
| USDC  | usd-coin     | BTC-USDC |
| BUSD  | binance-usd  | All stablecoin pairs |

See `agents/skills/getPriceHistory.ts` for complete list.

## API Rate Limits

### CoinGecko Free Tier
- ⚠️ **Limit**: 10-12 requests per minute
- **Cost**: Free
- **Solution**: Add delays between requests

### Recommendation
For production use, consider:
- CoinGecko Pro API ($129/month, 500 calls/min)
- Alternative data providers (DexScreener, The Graph)
- Caching historical data locally

If you encounter rate limits:
```
⚠️ CoinGecko rate limit exceeded. Wait a few minutes or use API key.
```
**Solution**: Wait 60 seconds before making more requests.

## Code Examples

### Example 1: Get Price Ratio for 90 Days
```typescript
import { getPriceRatioForPeriod } from './agents/skills/getPriceHistory.js';

const result = await getPriceRatioForPeriod("ETH", "BUSD", 90);

console.log(`Price Ratio: ${result.priceRatio}`);
console.log(`Impermanent Loss: ${result.impermanentLossPercent}%`);

// Use in LP calculator
const V_final = calculateOptimizedFinalValue(
  { V_initial: 10000, days: 90, r: result.priceRatio },
  poolData
);
```

### Example 2: Custom Date Range
```typescript
import { calculatePriceRatio } from './agents/skills/getPriceHistory.js';

const result = await calculatePriceRatio(
  "BTC", 
  "BUSD",
  new Date("2024-01-01"),
  new Date("2024-12-31")
);

console.log(`2024 Performance:`);
console.log(`  BTC price change: ${result.priceChange1Percent}%`);
console.log(`  Impermanent Loss: ${result.impermanentLossPercent}%`);
```

### Example 3: Analyze Multiple Periods
```typescript
import { analyzeHistoricalIL } from './agents/skills/getPriceHistory.js';

const analysis = await analyzeHistoricalIL("ETH", "BNB", [7, 30, 90, 180]);

for (const period of analysis.periods) {
  console.log(`${period.days} days: IL = ${period.impermanentLossPercent}%`);
}

// Output:
// 7 days: IL = -0.52%
// 30 days: IL = -1.84%
// 90 days: IL = -3.21%
// 180 days: IL = -5.67%
```

## Integration with LP Calculator

The historical price data integrates seamlessly with the existing V_final calculator:

```typescript
import { getPriceRatioForPeriod } from './agents/skills/getPriceHistory.js';
import { calculateOptimizedFinalValue } from './agents/skills/analyzePool-LPV2.js';
import { getPancakeSwapPoolData } from './agents/skills/getPoolData.js';

// 1. Get pool data
const pools = await getPancakeSwapPoolData();
const selectedPool = pools[0]; // ETH-BUSD pool

// 2. Get historical price ratio
const priceData = await getPriceRatioForPeriod("ETH", "BUSD", 90);

// 3. Calculate V_final
const V_final = calculateOptimizedFinalValue(
  {
    V_initial: 10000,
    days: 90,
    r: priceData.priceRatio // r from real historical data
  },
  selectedPool.exogenousParams
);

console.log(`Expected final value: $${V_final.toFixed(2)}`);
```

## Real-World Example

### Scenario: ETH-BUSD LP Position (90 days)

**Manual Estimation:**
```
User guesses: r = 1.2 (expects ETH to go up 20%)
Result: V_final = $11,234 (optimistic)
```

**Historical Data:**
```bash
npm run calc:historical
# Select ETH-BUSD pool
# Enter: V_initial = $10,000, days = 90
```

**Output:**
```
Historical Price Analysis (90 days):
  ETH: $3021.30 → $2011.68 (-33.42%)
  BUSD: $0.9983 → $1.0007 (+0.24%)
  
📊 Calculated r = 0.664233
📉 Historical IL = -2.06%

💰 V_final = $9,456.23
   Total return: -$543.77 (-5.44%)
```

**Insight**: Historical data shows ETH dropped significantly, resulting in negative returns despite trading fees and farming rewards. Manual estimation was too optimistic.

## Limitations

1. **Historical ≠ Future Performance**
   - Past price movements don't predict future results
   - Market conditions change

2. **Data Availability**
   - Only works for tokens in CoinGecko database
   - Some newer tokens may not have historical data

3. **Rate Limiting**
   - Free tier: ~10 requests/minute
   - Testing multiple periods hits limits quickly

4. **Data Accuracy**
   - CoinGecko aggregates prices from multiple exchanges
   - May not exactly match PancakeSwap spot prices
   - Daily granularity (not minute-by-minute)

## Troubleshooting

### "Could not retrieve historical price data"
**Causes:**
- Token not in CoinGecko database
- Rate limit exceeded
- Network error

**Solutions:**
1. Wait 60 seconds and retry
2. Enter `r` manually when prompted
3. Check token spelling (must match COINGECKO_IDS in getPriceHistory.ts)

### "Rate limit exceeded"
**Solutions:**
1. Wait 60 seconds between test runs
2. Use `calc:historical` (fewer API calls than `test:pricehistory`)
3. Consider CoinGecko Pro API for production

### "Failed to fetch from CoinGecko: 429"
This is normal when running multiple tests. The system handles it gracefully:
```typescript
if (!priceRatioData) {
  // Falls back to manual r input
  const r = await question('Enter r manually: ');
}
```

## Next Steps

### Current Capabilities ✅
- Fetch historical prices (1-730 days)
- Calculate price ratio from real data
- Analyze impermanent loss historically
- Integrate with V_final calculator

### Future Enhancements 🚀
- **Local caching**: Store historical data to reduce API calls
- **Alternative data sources**: DexScreener, The Graph
- **ML predictions**: Train models on historical data to predict future `r`
- **Volatility analysis**: Calculate asset pair correlation and risk metrics
- **Backtesting engine**: Test strategies across multiple historical periods

## References

- CoinGecko API: https://www.coingecko.com/en/api/documentation
- PancakeSwap V2: https://docs.pancakeswap.finance/
- Impermanent Loss: https://finematics.com/impermanent-loss-explained/

---

**Created**: February 2026
**Version**: 1.0.0
**Status**: Production Ready (with rate limit awareness)
