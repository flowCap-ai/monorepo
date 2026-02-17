# Adding New Tokens to Historical Price System

## Overview

The historical price system currently supports 20+ major cryptocurrencies. This guide shows how to add support for new tokens.

## Current Token List

See `agents/skills/getPriceHistory.ts`:

```typescript
const COINGECKO_IDS: { [symbol: string]: string } = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'BNB': 'binancecoin',
  'CAKE': 'pancakeswap-token',
  'USDT': 'tether',
  'USDC': 'usd-coin',
  'BUSD': 'binance-usd',
  'DAI': 'dai',
  'WBNB': 'wbnb',
  'BTCB': 'bitcoin-bep20',
  // ... 20+ more
};
```

## Step-by-Step: Adding a New Token

### Step 1: Find CoinGecko ID

**Option A: Search CoinGecko Website**
1. Go to https://www.coingecko.com
2. Search for your token (e.g., "Arbitrum")
3. Click on the token
4. Look at the URL: `https://www.coingecko.com/en/coins/arbitrum`
5. The ID is the last part: `arbitrum`

**Option B: Use CoinGecko API**
```bash
curl "https://api.coingecko.com/api/v3/search?query=arbitrum" | jq '.coins[0].id'
```

**Option C: Check Common Patterns**
- Bitcoin → `bitcoin`
- Ethereum → `ethereum`
- BNB → `binancecoin`
- Wrapped versions → usually `w{token}` (e.g., `wbnb`)
- BEP20 versions → usually `{token}-bep20` (e.g., `bitcoin-bep20`)

### Step 2: Edit getPriceHistory.ts

Add your token to the `COINGECKO_IDS` mapping:

```typescript
// In agents/skills/getPriceHistory.ts

const COINGECKO_IDS: { [symbol: string]: string } = {
  // Existing tokens...
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  
  // Add your new token here:
  'ARB': 'arbitrum',           // Arbitrum
  'MATIC': 'matic-network',    // Polygon
  'AVAX': 'avalanche-2',       // Avalanche
  'OP': 'optimism',            // Optimism
};
```

**Important**: 
- Key (left side): Symbol as it appears in PancakeSwap pool names
- Value (right side): Exact CoinGecko ID (check carefully!)

### Step 3: Test the New Token

Create a test script:

```typescript
import { getPriceRatioForPeriod } from './agents/skills/getPriceHistory.js';

// Test your new token
const result = await getPriceRatioForPeriod("ARB", "USDT", 30);

if (result) {
  console.log(`✅ ARB-USDT historical data retrieved successfully!`);
  console.log(`   30-day price ratio: ${result.priceRatio}`);
  console.log(`   IL: ${result.impermanentLossPercent}%`);
} else {
  console.error(`❌ Failed to retrieve ARB-USDT data`);
}
```

Run it:
```bash
tsx test-new-token.ts
```

### Step 4: Verify in Calculator

```bash
npm run calc:historical
# Select a pool with your new token (e.g., ARB-BUSD)
# System should automatically fetch historical prices
```

## Common Issues

### Issue 1: "Token not found in CoinGecko database"

**Cause**: Wrong CoinGecko ID or token not listed on CoinGecko

**Solution**:
1. Double-check the ID on coingecko.com
2. Try alternative names (e.g., `weth` vs `ethereum`)
3. If token is too new, CoinGecko may not have data yet

### Issue 2: "Failed to fetch price history"

**Cause**: Rate limiting or network error

**Solution**:
```bash
# Wait 60 seconds between API calls
sleep 60
npm run test:pricehistory
```

### Issue 3: Symbol Mismatch

**Problem**: Pool says "WETH-BUSD" but you added "ETH"

**Solution**: Add both variations:
```typescript
const COINGECKO_IDS: { [symbol: string]: string } = {
  'ETH': 'ethereum',
  'WETH': 'ethereum',  // Same CoinGecko ID for wrapped version
  'BTCB': 'bitcoin',   // BEP20 Bitcoin = regular Bitcoin prices
  'BTC': 'bitcoin',
};
```

## Real-World Examples

### Example 1: Adding Arbitrum (ARB)

```typescript
// 1. Find CoinGecko ID
// https://www.coingecko.com/en/coins/arbitrum → arbitrum

// 2. Add to mapping
'ARB': 'arbitrum',

// 3. Test
const result = await getPriceRatioForPeriod("ARB", "BUSD", 90);
// ✅ Works!
```

### Example 2: Adding Wrapped BNB (WBNB)

```typescript
// WBNB uses same price as BNB
'WBNB': 'wbnb',  // Specific WBNB ID exists
// OR
'WBNB': 'binancecoin',  // Use BNB price if WBNB not available
```

### Example 3: Adding Stablecoins

```typescript
// DAI
'DAI': 'dai',

// USDC
'USDC': 'usd-coin',

// USDT  
'USDT': 'tether',

// Note: Stablecoin pairs (e.g., USDT-BUSD) will have r ≈ 1.0
// and minimal IL
```

## Batch Adding Multiple Tokens

If you need to add many tokens at once:

```typescript
// Create a helper script: add-tokens.ts
import fetch from 'node-fetch';

const tokensToAdd = ['ARB', 'MATIC', 'AVAX', 'OP'];

for (const symbol of tokensToAdd) {
  const response = await fetch(
    `https://api.coingecko.com/api/v3/search?query=${symbol}`
  );
  const data = await response.json();
  
  if (data.coins && data.coins.length > 0) {
    const id = data.coins[0].id;
    console.log(`'${symbol}': '${id}',`);
  }
  
  // Wait to avoid rate limits
  await new Promise(resolve => setTimeout(resolve, 2000));
}
```

Run:
```bash
tsx add-tokens.ts
```

Output:
```typescript
'ARB': 'arbitrum',
'MATIC': 'matic-network',
'AVAX': 'avalanche-2',
'OP': 'optimism',
```

Copy-paste this into `COINGECKO_IDS`.

## Verification Checklist

After adding a new token, verify:

- [ ] Token works in `calc:historical` for pair using new token
- [ ] No TypeScript errors: `npm run build`
- [ ] Historical prices fetch successfully
- [ ] Price ratio calculation works (r ≠ 0)
- [ ] IL calculation is reasonable (not NaN or Infinity)

## Contributing

If you add support for popular tokens, consider contributing back:

1. Fork the repo
2. Add tokens to `getPriceHistory.ts`
3. Test with real API calls
4. Submit pull request

Popular tokens to add:
- Layer 2: ARB, OP, MATIC
- DeFi: AAVE, UNI, SUSHI, CRV
- Stablecoins: TUSD, FRAX, LUSD
- Memecoins: (at your own risk 😄)

## Advanced: Supporting Non-CoinGecko Tokens

For tokens not on CoinGecko, you can extend the system to use alternative data sources:

### Option 1: DexScreener API

```typescript
// In getPriceHistory.ts, add:
async function getDexScreenerHistory(tokenAddress: string, days: number) {
  // DexScreener has historical data for BSC tokens
  const response = await fetch(
    `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`
  );
  // Parse and return price history
}
```

### Option 2: The Graph

```typescript
// Query PancakeSwap subgraph for historical prices
const query = `
  {
    tokenDayDatas(
      where: { token: "${tokenAddress}" }
      orderBy: date
      orderDirection: desc
      first: ${days}
    ) {
      date
      priceUSD
    }
  }
`;
```

### Option 3: Local Price Cache

For frequently used tokens, cache historical prices:

```typescript
// cache/ETH-prices.json
{
  "2024-01-01": 2234.56,
  "2024-01-02": 2245.12,
  // ... daily prices
}

// Load from cache first, fallback to API
```

## Token Priority List

If you can only add a few tokens, prioritize by:

1. **Liquidity**: Focus on top 20 TVL pools on PancakeSwap
2. **Stability**: Major tokens (BTC, ETH, BNB) first
3. **Use cases**: Tokens your users actually trade

Check PancakeSwap top pools:
```bash
npm run calc:onchain
# Look at the list of top 20 pools
# Add tokens that appear most frequently
```

## Maintenance

**Monthly**: Check for new major listings
```bash
# Check PancakeSwap top pools
npm run calc:onchain

# Add any new tokens appearing in top 20
```

**After major DeFi events**: 
- New chain integrations (e.g., layer 2 bridges)
- Major token launches
- Stablecoin launches

## Support

If you have trouble adding a token:

1. Check CoinGecko API docs: https://www.coingecko.com/en/api/documentation
2. Verify token exists on CoinGecko website
3. Try alternative spellings (WBNB vs BNB vs Binance Coin)
4. Check GitHub issues for similar problems

---

**Last updated**: February 2026
**Supported tokens**: 20+ (and growing)
