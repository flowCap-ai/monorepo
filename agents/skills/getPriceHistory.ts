/**
 * getPriceHistory.ts - Retrieve historical price data for crypto assets
 * 
 * This module fetches historical price data from various sources:
 * - CoinGecko API (free, rate-limited)
 * - DexScreener API (DEX-specific)
 * 
 * Use cases:
 * - Calculate price ratio (r) from historical data
 * - Backtest LP positions
 * - Analyze impermanent loss over time
 */

const COINGECKO_API_URL = process.env.COINGECKO_API_URL || 'https://api.coingecko.com/api/v3';
const DEXSCREENER_API = process.env.DEXSCREENER_API || 'https://api.dexscreener.com/latest/dex';

/**
 * Price data point
 */
export interface PricePoint {
  timestamp: number;      // Unix timestamp
  date: string;           // ISO date string
  price: number;          // Price in USD
}

/**
 * Historical price data for an asset
 */
export interface PriceHistory {
  asset: string;
  startDate: string;
  endDate: string;
  dataPoints: PricePoint[];
  source: 'coingecko' | 'dexscreener';
}

/**
 * Price ratio calculation result
 */
export interface PriceRatioResult {
  asset1: string;
  asset2: string;
  initialPrice1: number;
  initialPrice2: number;
  finalPrice1: number;
  finalPrice2: number;
  priceRatio: number;        // r = (P_final1 / P_final2) / (P_initial1 / P_initial2)
  priceChange1Percent: number;
  priceChange2Percent: number;
  impermanentLossPercent: number;
}

/**
 * Map common token symbols to CoinGecko IDs
 */
const COINGECKO_IDS: Record<string, string> = {
  'BTC': 'bitcoin',
  'BTCB': 'bitcoin',
  'ETH': 'ethereum',
  'BNB': 'binancecoin',
  'WBNB': 'binancecoin',
  'BUSD': 'binance-usd',
  'USDT': 'tether',
  'USDC': 'usd-coin',
  'DAI': 'dai',
  'CAKE': 'pancakeswap-token',
  'XRP': 'ripple',
  'ADA': 'cardano',
  'DOGE': 'dogecoin',
  'MATIC': 'matic-network',
  'DOT': 'polkadot',
  'UNI': 'uniswap',
  'LINK': 'chainlink',
  'ATOM': 'cosmos',
  'LTC': 'litecoin',
  'BCH': 'bitcoin-cash',
};

/**
 * Get CoinGecko ID from token symbol
 */
function getCoinGeckoId(symbol: string): string | null {
  const upperSymbol = symbol.toUpperCase();
  return COINGECKO_IDS[upperSymbol] || null;
}

/**
 * Sleep/wait for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get historical prices from CoinGecko with retry logic for rate limits
 * 
 * @param symbol - Token symbol (e.g., 'BTC', 'ETH', 'BNB')
 * @param days - Number of days of history (1, 7, 14, 30, 90, 180, 365, max)
 * @param interval - Data granularity ('daily' recommended for > 90 days)
 */
export async function getHistoricalPricesFromCoinGecko(
  symbol: string,
  days: number | 'max' = 30,
  interval: 'hourly' | 'daily' = 'daily'
): Promise<PriceHistory | null> {
  const MAX_RETRY_DURATION_MS = 3 * 60 * 1000; // 3 minutes
  const INITIAL_BACKOFF_MS = 5000; // Start with 5 seconds
  const MAX_BACKOFF_MS = 60000; // Cap at 60 seconds
  
  try {
    const coinId = getCoinGeckoId(symbol);
    if (!coinId) {
      console.error(`Token ${symbol} not found in CoinGecko mapping. Add it to COINGECKO_IDS.`);
      return null;
    }

    // CoinGecko uses 'daily' interval automatically for days > 90
    const intervalParam = typeof days === 'number' && days > 90 ? 'daily' : interval;
    
    const url = `${COINGECKO_API_URL}/coins/${coinId}/market_chart?vs_currency=usd&days=${days}&interval=${intervalParam}`;
    
    console.log(`Fetching ${symbol} price history from CoinGecko (${days} days)...`);
    
    const startTime = Date.now();
    let attempt = 0;
    let backoffMs = INITIAL_BACKOFF_MS;
    
    while (true) {
      const elapsedMs = Date.now() - startTime;
      
      // Check if we've exceeded the total retry duration
      if (attempt > 0 && elapsedMs >= MAX_RETRY_DURATION_MS) {
        console.error(`⏱️  Retry timeout exceeded (3 minutes). Giving up on ${symbol}.`);
        return null;
      }
      
      try {
        const response = await fetch(url);
        
        if (!response.ok) {
          if (response.status === 429) {
            attempt++;
            const remainingMs = MAX_RETRY_DURATION_MS - elapsedMs;
            
            if (remainingMs <= 0) {
              console.error(`⏱️  Rate limit retry timeout exceeded for ${symbol}.`);
              return null;
            }
            
            const waitMs = Math.min(backoffMs, remainingMs);
            console.warn(`⏳ CoinGecko rate limit hit. Retrying in ${(waitMs / 1000).toFixed(1)}s... (attempt ${attempt})`);
            
            await sleep(waitMs);
            
            // Exponential backoff with cap
            backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
            continue; // Retry the request
          }
          
          // Non-429 error - fail immediately
          console.error(`Failed to fetch from CoinGecko: ${response.status}`);
          return null;
        }

        const data = await response.json() as { prices?: [number, number][] };
        
        if (!data.prices || data.prices.length === 0) {
          console.error('No price data returned from CoinGecko');
          return null;
        }

        const dataPoints: PricePoint[] = data.prices.map(([timestamp, price]) => ({
          timestamp,
          date: new Date(timestamp).toISOString(),
          price,
        }));

        const startDate = dataPoints[0].date;
        const endDate = dataPoints[dataPoints.length - 1].date;

        if (attempt > 0) {
          console.log(`✅ Retry successful after ${attempt} attempt(s)!`);
        }
        console.log(`✅ Retrieved ${dataPoints.length} price points for ${symbol} (${startDate} to ${endDate})`);

        return {
          asset: symbol,
          startDate,
          endDate,
          dataPoints,
          source: 'coingecko',
        };
      } catch (fetchError) {
        // Network or parsing error - fail immediately
        console.error(`Network error fetching ${symbol}:`, fetchError);
        return null;
      }
    }
  } catch (error) {
    console.error(`Error fetching historical prices for ${symbol}:`, error);
    return null;
  }
}

/**
 * Get current price from CoinGecko with retry logic for rate limits
 */
export async function getCurrentPrice(symbol: string): Promise<number | null> {
  const MAX_RETRY_DURATION_MS = 3 * 60 * 1000; // 3 minutes
  const INITIAL_BACKOFF_MS = 5000; // Start with 5 seconds
  const MAX_BACKOFF_MS = 60000; // Cap at 60 seconds
  
  try {
    const coinId = getCoinGeckoId(symbol);
    if (!coinId) return null;

    const url = `${COINGECKO_API_URL}/simple/price?ids=${coinId}&vs_currencies=usd`;
    
    const startTime = Date.now();
    let attempt = 0;
    let backoffMs = INITIAL_BACKOFF_MS;
    
    while (true) {
      const elapsedMs = Date.now() - startTime;
      
      // Check if we've exceeded the total retry duration
      if (attempt > 0 && elapsedMs >= MAX_RETRY_DURATION_MS) {
        console.error(`⏱️  Retry timeout exceeded (3 minutes) for current price of ${symbol}.`);
        return null;
      }
      
      try {
        const response = await fetch(url);
        
        if (!response.ok) {
          if (response.status === 429) {
            attempt++;
            const remainingMs = MAX_RETRY_DURATION_MS - elapsedMs;
            
            if (remainingMs <= 0) {
              return null;
            }
            
            const waitMs = Math.min(backoffMs, remainingMs);
            console.warn(`⏳ Rate limit hit for current price. Retrying in ${(waitMs / 1000).toFixed(1)}s...`);
            
            await sleep(waitMs);
            backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
            continue;
          }
          
          // Non-429 error - fail immediately
          return null;
        }

        const data = await response.json() as Record<string, { usd?: number }>;
        return data[coinId]?.usd || null;
      } catch (fetchError) {
        // Network error - fail immediately
        return null;
      }
    }
  } catch (error) {
    console.error(`Error fetching current price for ${symbol}:`, error);
    return null;
  }
}

/**
 * Calculate price ratio between two dates for a pair
 * 
 * This calculates the ratio needed for IL calculation:
 * r = (P1_final / P2_final) / (P1_initial / P2_initial)
 * 
 * @param asset1 - First asset symbol (e.g., 'ETH')
 * @param asset2 - Second asset symbol (e.g., 'BUSD')
 * @param startDate - Start date (ISO string or Date)
 * @param endDate - End date (ISO string or Date) - defaults to now
 */
export async function calculatePriceRatio(
  asset1: string,
  asset2: string,
  startDate: string | Date,
  endDate?: string | Date
): Promise<PriceRatioResult | null> {
  try {
    const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
    const end = endDate ? (typeof endDate === 'string' ? new Date(endDate) : endDate) : new Date();
    
    const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    
    console.log(`\nCalculating price ratio for ${asset1}/${asset2}`);
    console.log(`Period: ${start.toISOString().split('T')[0]} to ${end.toISOString().split('T')[0]} (${daysDiff} days)\n`);

    // Fetch historical data for both assets
    const [history1, history2] = await Promise.all([
      getHistoricalPricesFromCoinGecko(asset1, daysDiff + 1),
      getHistoricalPricesFromCoinGecko(asset2, daysDiff + 1),
    ]);

    if (!history1 || !history2) {
      console.error('Failed to fetch price history for one or both assets');
      return null;
    }

    // Find prices closest to start and end dates
    const startTimestamp = start.getTime();
    const endTimestamp = end.getTime();

    // Find initial prices (closest to start date)
    const initial1 = history1.dataPoints.reduce((closest, point) => {
      const diff = Math.abs(point.timestamp - startTimestamp);
      const closestDiff = Math.abs(closest.timestamp - startTimestamp);
      return diff < closestDiff ? point : closest;
    });

    const initial2 = history2.dataPoints.reduce((closest, point) => {
      const diff = Math.abs(point.timestamp - startTimestamp);
      const closestDiff = Math.abs(closest.timestamp - startTimestamp);
      return diff < closestDiff ? point : closest;
    });

    // Find final prices (closest to end date)
    const final1 = history1.dataPoints.reduce((closest, point) => {
      const diff = Math.abs(point.timestamp - endTimestamp);
      const closestDiff = Math.abs(closest.timestamp - endTimestamp);
      return diff < closestDiff ? point : closest;
    });

    const final2 = history2.dataPoints.reduce((closest, point) => {
      const diff = Math.abs(point.timestamp - endTimestamp);
      const closestDiff = Math.abs(closest.timestamp - endTimestamp);
      return diff < closestDiff ? point : closest;
    });

    // Calculate relative price ratios
    const initialRatio = initial1.price / initial2.price;
    const finalRatio = final1.price / final2.price;
    
    // Price ratio for IL calculation
    const priceRatio = finalRatio / initialRatio;

    // Price changes
    const priceChange1Percent = ((final1.price - initial1.price) / initial1.price) * 100;
    const priceChange2Percent = ((final2.price - initial2.price) / initial2.price) * 100;

    // Calculate impermanent loss
    const ilFactor = (2 * Math.sqrt(priceRatio)) / (1 + priceRatio);
    const impermanentLossPercent = (ilFactor - 1) * 100;

    console.log('Price Analysis:');
    console.log(`  ${asset1}: $${initial1.price.toFixed(4)} → $${final1.price.toFixed(4)} (${priceChange1Percent > 0 ? '+' : ''}${priceChange1Percent.toFixed(2)}%)`);
    console.log(`  ${asset2}: $${initial2.price.toFixed(4)} → $${final2.price.toFixed(4)} (${priceChange2Percent > 0 ? '+' : ''}${priceChange2Percent.toFixed(2)}%)`);
    console.log(`\nPrice Ratio (r): ${priceRatio.toFixed(6)}`);
    console.log(`Impermanent Loss: ${impermanentLossPercent.toFixed(2)}%\n`);

    return {
      asset1,
      asset2,
      initialPrice1: initial1.price,
      initialPrice2: initial2.price,
      finalPrice1: final1.price,
      finalPrice2: final2.price,
      priceRatio,
      priceChange1Percent,
      priceChange2Percent,
      impermanentLossPercent,
    };
  } catch (error) {
    console.error('Error calculating price ratio:', error);
    return null;
  }
}

/**
 * Get price ratio for a specific number of days in the past
 * 
 * @param asset1 - First asset symbol
 * @param asset2 - Second asset symbol
 * @param days - Number of days to look back
 */
export async function getPriceRatioForPeriod(
  asset1: string,
  asset2: string,
  days: number
): Promise<PriceRatioResult | null> {
  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
  
  return calculatePriceRatio(asset1, asset2, startDate, endDate);
}

/**
 * Analyze historical impermanent loss for a pair over multiple periods
 */
export async function analyzeHistoricalIL(
  asset1: string,
  asset2: string,
  periods: number[] = [7, 30, 90, 180, 365]
): Promise<{
  pair: string;
  periods: Array<{
    days: number;
    priceRatio: number;
    ilPercent: number;
    asset1Change: number;
    asset2Change: number;
  }>;
} | null> {
  try {
    console.log(`\n═══════════════════════════════════════════════════════════════`);
    console.log(`Historical IL Analysis: ${asset1}/${asset2}`);
    console.log(`═══════════════════════════════════════════════════════════════\n`);

    const results = [];

    for (const days of periods) {
      console.log(`Analyzing ${days}-day period...`);
      const ratio = await getPriceRatioForPeriod(asset1, asset2, days);
      
      if (ratio) {
        results.push({
          days,
          priceRatio: ratio.priceRatio,
          ilPercent: ratio.impermanentLossPercent,
          asset1Change: ratio.priceChange1Percent,
          asset2Change: ratio.priceChange2Percent,
        });
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (results.length === 0) {
      console.error('No data retrieved for any period');
      return null;
    }

    // Display summary table
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`Period | ${asset1.padEnd(8)} | ${asset2.padEnd(8)} | Price Ratio | IL`);
    console.log('-------|----------|----------|-------------|--------');
    
    for (const result of results) {
      const daysStr = `${result.days}d`.padEnd(6);
      const change1 = `${result.asset1Change > 0 ? '+' : ''}${result.asset1Change.toFixed(1)}%`.padEnd(8);
      const change2 = `${result.asset2Change > 0 ? '+' : ''}${result.asset2Change.toFixed(1)}%`.padEnd(8);
      const ratio = result.priceRatio.toFixed(4).padEnd(11);
      const il = `${result.ilPercent.toFixed(2)}%`;
      
      console.log(`${daysStr} | ${change1} | ${change2} | ${ratio} | ${il}`);
    }
    console.log('\n');

    return {
      pair: `${asset1}/${asset2}`,
      periods: results,
    };
  } catch (error) {
    console.error('Error analyzing historical IL:', error);
    return null;
  }
}

/**
 * Get daily price ratio time series for Monte Carlo simulation
 * 
 * Returns array of price ratios (asset1/asset2) synchronized by date
 * Used for estimating distribution parameters: log(P_{t+1}/P_t) ~ Normal(μ, σ²)
 * 
 * @param asset1 - First asset symbol (e.g., 'ETH')
 * @param asset2 - Second asset symbol (e.g., 'BUSD')
 * @param days - Number of historical days
 * @returns Array of price ratios in chronological order
 */
export async function getPriceRatioTimeSeries(
  asset1: string,
  asset2: string,
  days: number
): Promise<number[] | null> {
  try {
    // Fetch both asset histories
    const history1 = await getHistoricalPricesFromCoinGecko(asset1, days);
    const history2 = await getHistoricalPricesFromCoinGecko(asset2, days);
    
    if (!history1 || !history2) {
      return null;
    }
    
    // Match data points by date
    const priceRatios: number[] = [];
    
    for (let i = 0; i < history1.dataPoints.length; i++) {
      const point1 = history1.dataPoints[i];
      const point2 = history2.dataPoints[i];
      
      // Check dates match (should be synced from API)
      if (point1.date.substring(0, 10) === point2.date.substring(0, 10)) {
        const ratio = point1.price / point2.price;
        priceRatios.push(ratio);
      }
    }
    
    if (priceRatios.length < 2) {
      throw new Error('Not enough matching price points');
    }
    
    return priceRatios;
  } catch (error) {
    console.error(`Failed to get price ratio time series: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

/**
 * Get historical prices as array (for distribution parameter estimation)
 * 
 * @param asset - Asset symbol
 * @param days - Number of days
 * @returns Array of prices in chronological order
 */
export async function getPriceArray(asset: string, days: number): Promise<number[] | null> {
  const history = await getHistoricalPricesFromCoinGecko(asset, days);
  if (!history) return null;
  
  return history.dataPoints.map(p => p.price);
}

/**
 * Export default for easy import
 */
export default {
  getHistoricalPricesFromCoinGecko,
  getCurrentPrice,
  calculatePriceRatio,
  getPriceRatioForPeriod,
  analyzeHistoricalIL,
  getPriceRatioTimeSeries,
  getPriceArray,
};
