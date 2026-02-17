# Historical Price Data - Quick Reference

## Before vs After

### ❌ Before (Manual Estimation)

```bash
npm run calc:final
```

**User must guess:**
- "What will the price ratio be in 90 days?" → User guesses `r = 1.2`
- **Problem**: Often wildly inaccurate
- **Result**: Unrealistic predictions

### ✅ After (Historical Data)

```bash
npm run calc:historical
```

**System calculates from real data:**
- Fetches actual 90-day price history from CoinGecko
- Computes `r = 0.6642` from ETH: $3021 → $2011
- **Benefit**: Based on historical reality
- **Result**: Realistic predictions for backtesting

## Real Example

### ETH-BUSD LP Position ($10,000 for 90 days)

| Method | r value | V_final | Return | Accuracy |
|--------|---------|---------|--------|----------|
| **Manual guess** | 1.20 | $11,234 | +12.3% | ❌ Overly optimistic |
| **Historical data** | 0.66 | $9,456 | -5.4% | ✅ Based on real prices |

## Key Insights

1. **ETH dropped 33%** over the period
2. **IL = -2.06%** from price divergence
3. **Trading fees + farming** earned +1.2%
4. **Net result**: -5.4% (IL exceeded yield)

**Lesson**: Historical data shows that during bearish periods, IL can exceed LP yields. This is critical information for risk assessment.

## When to Use Each Calculator

### Use `calc:historical` when:
- ✅ Backtesting past performance
- ✅ Understanding how a strategy would have performed
- ✅ Analyzing historical IL risk
- ✅ You want data-driven predictions

### Use `calc:final` when:
- ✅ You have a specific future price prediction
- ✅ Testing "what-if" scenarios
- ✅ The token pair isn't in CoinGecko database
- ✅ You want to model optimistic/pessimistic scenarios

### Use `calc:onchain` when:
- ✅ You want real pool data but have your own `r` prediction
- ✅ Testing multiple pools quickly
- ✅ You need accurate TVL, volume, and staking data

## Quick Start

```bash
# Most users should start here:
npm run calc:historical

# Follow the prompts:
1. Select pool (e.g., ETH-BUSD)
2. Enter investment: 10000
3. Enter period: 90
4. System fetches historical prices automatically
5. View realistic V_final based on historical data
```

## Sample Output

```
═══════════════════════════════════════════════════════════════
Historical Price Analysis (90 days)
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

═══════════════════════════════════════════════════════════════
RESULTS
═══════════════════════════════════════════════════════════════

💰 V_final = $9,456.23

Performance:
  Initial investment:     $10,000.00
  Final value:            $9,456.23
  Total return:           -$543.77 (-5.44%)
  Annualized APY:         -22.04%
  Period:                 90 days

Price Impact:
  Price ratio (r):        0.664233
  Impermanent Loss:       -2.06%
  Data source:            Historical (CoinGecko)

Pool Info:
  Pool:                   ETH-BUSD v2
  Assets:                 ETH / BUSD
  Farming rewards:        Included

⚠️  Warning: Expected negative returns based on historical price movement.
   Historical IL exceeded the yield from fees and farming.
```

## Integration with AI Agent

The FlowCap AI agent can use historical data to make informed decisions:

```typescript
// Agent analyzes historical risk before entering position
const historicalIL = await analyzeHistoricalIL("ETH", "BNB", [7, 30, 90]);

// If historical IL is high, agent might:
// 1. Avoid the position
// 2. Reduce position size
// 3. Choose a more stable pair (e.g., USDT-BUSD)

if (historicalIL.periods[2].impermanentLossPercent < -5) {
  console.log("High IL risk detected. Suggesting stablecoin pair instead.");
}
```

## Supported Token Pairs

### Highest Accuracy
- ETH-BUSD, ETH-USDT, ETH-BNB
- BTC-BUSD, BTC-USDT
- BNB-BUSD, BNB-USDT
- CAKE-BNB, CAKE-BUSD

### Good Accuracy (Major Altcoins)
- All pairs with top 50 cryptocurrencies
- CoinGecko has comprehensive data for major assets

### Limited Accuracy
- Very new tokens (<6 months old)
- Low market cap tokens not tracked by CoinGecko
- Fallback: Enter `r` manually when prompted

## API Rate Limits

**Free Tier**: 10-12 calls/minute

**Smart usage:**
```bash
# ✅ GOOD: One calculator run = 2 API calls (one per asset)
npm run calc:historical

# ⚠️ CAREFUL: Test suite = 8+ API calls (hits rate limit)
npm run test:pricehistory
# Wait 60 seconds if you see "rate limit exceeded"
```

## Next Steps

1. **Try it now**: `npm run calc:historical`
2. **Read full guide**: [docs/HISTORICAL_PRICES_GUIDE.md](../HISTORICAL_PRICES_GUIDE.md)
3. **Understand the math**: [POOL_DATA_EXOGENOUS_PARAMS.md](../POOL_DATA_EXOGENOUS_PARAMS.md)

---

**Last updated**: February 2026
**Feature version**: 1.0.0
