/**
 * GetBadDebtHistory.ts
 * 
 * Retrieves historical bad debt data for lending markets
 * Bad Debt (δ) = Losses from failed liquidations (underwater positions)
 * 
 * Bad debt occurs when:
 * 1. Collateral value drops faster than liquidators can act
 * 2. Liquidation incentives insufficient
 * 3. Network congestion prevents timely liquidations
 * 4. Oracle manipulation or failures
 */

interface BadDebtEvent {
  timestamp: number;
  protocol: string;
  asset: string;
  amount: number;        // USD value of bad debt
  lossPercentage: number; // % of total supplied lost
  reason: string;
}

interface BadDebtStatistics {
  totalBadDebt: number;       // Total USD lost
  eventCount: number;
  meanLossPerEvent: number;
  annualizedBadDebtRate: number; // Expected % of supply lost per year
  eventsPerYear: number;
  historicalEvents: BadDebtEvent[];
}

/**
 * Simulate bad debt history based on protocol risk factors
 * In production: fetch real liquidation/underwater events from blockchain
 */
function simulateBadDebtHistory(
  protocol: string,
  asset: string,
  days: number,
  riskLevel: 'low' | 'medium' | 'high'
): BadDebtEvent[] {
  const events: BadDebtEvent[] = [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  
  // Risk-based event frequency (events per year)
  const eventFrequency = {
    low: 0.5,     // 1 event every 2 years
    medium: 2,    // 2 events per year
    high: 6       // 6 events per year
  }[riskLevel];
  
  // Risk-based loss magnitude (% of supply)
  const lossMagnitude = {
    low: 0.0001,    // 0.01% loss
    medium: 0.001,  // 0.1% loss
    high: 0.01      // 1% loss
  }[riskLevel];
  
  const expectedEvents = Math.floor((days / 365) * eventFrequency);
  
  for (let i = 0; i < expectedEvents; i++) {
    // Random timestamp within the period
    const dayOffset = Math.floor(Math.random() * days);
    const timestamp = now - dayOffset * dayMs;
    
    // Random loss amount
    const variability = 0.5 + Math.random(); // 0.5x to 1.5x
    const lossPercentage = lossMagnitude * variability;
    
    // Reasons for bad debt
    const reasons = [
      'Flash crash liquidation failure',
      'Network congestion during volatility',
      'Oracle price manipulation',
      'Insufficient liquidation incentives',
      'Recursive leverage unwinding'
    ];
    
    events.push({
      timestamp,
      protocol,
      asset,
      amount: 0, // Will be calculated based on TVL in main function
      lossPercentage,
      reason: reasons[Math.floor(Math.random() * reasons.length)]
    });
  }
  
  return events.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Determine risk level based on protocol and asset characteristics
 */
function assessRiskLevel(protocol: string, asset: string): 'low' | 'medium' | 'high' {
  const stablecoins = ['USDT', 'USDC', 'BUSD', 'DAI', 'USDD'];
  const majorAssets = ['BTC', 'ETH', 'BNB', 'WBTC', 'WETH', 'WBNB'];
  const bluechipProtocols = ['Aave', 'Compound', 'Venus'];
  
  const isStablecoin = stablecoins.some(s => asset.toUpperCase().includes(s));
  const isMajorAsset = majorAssets.some(a => asset.toUpperCase().includes(a));
  const isBluechip = bluechipProtocols.some(p => protocol.toLowerCase().includes(p.toLowerCase()));
  
  if (isStablecoin && isBluechip) return 'low';
  if ((isMajorAsset || isStablecoin) && isBluechip) return 'low';
  if (isMajorAsset || isBluechip) return 'medium';
  return 'high';
}

/**
 * Calculate bad debt statistics
 */
function calculateBadDebtStats(
  events: BadDebtEvent[],
  days: number
): Omit<BadDebtStatistics, 'historicalEvents'> {
  const totalBadDebt = events.reduce((sum, e) => sum + e.amount, 0);
  const eventCount = events.length;
  const meanLossPerEvent = eventCount > 0 ? totalBadDebt / eventCount : 0;
  
  // Annualize the bad debt rate
  const totalLossPercentage = events.reduce((sum, e) => sum + e.lossPercentage, 0);
  const annualizedBadDebtRate = (totalLossPercentage / days) * 365;
  const eventsPerYear = (eventCount / days) * 365;
  
  return {
    totalBadDebt,
    eventCount,
    meanLossPerEvent,
    annualizedBadDebtRate,
    eventsPerYear
  };
}

/**
 * Main function to get bad debt history and statistics
 */
export async function getBadDebtHistory(
  protocol: string,  // e.g., "Venus", "Aave", "Compound"
  asset: string,     // e.g., "USDT", "USDC", "BNB"
  days: number = 365,
  averageTVL: number = 100_000_000 // Used to calculate USD amounts
): Promise<BadDebtStatistics> {
  console.log(`\n⚠️  Analyzing bad debt risk for ${protocol} ${asset}...\n`);
  
  // Assess risk level
  const riskLevel = assessRiskLevel(protocol, asset);
  console.log(`   Risk Level: ${riskLevel.toUpperCase()}`);
  
  // Get historical events (simulated - in production, fetch from blockchain)
  const events = simulateBadDebtHistory(protocol, asset, days, riskLevel);
  
  // Calculate USD amounts based on average TVL
  events.forEach(event => {
    event.amount = averageTVL * event.lossPercentage;
  });
  
  const stats = calculateBadDebtStats(events, days);
  
  console.log('\n📉 Bad Debt Statistics:');
  console.log(`   Total Events:        ${stats.eventCount}`);
  console.log(`   Events per Year:     ${stats.eventsPerYear.toFixed(2)}`);
  console.log(`   Total Bad Debt:      $${(stats.totalBadDebt / 1e6).toFixed(2)}M`);
  console.log(`   Mean Loss per Event: $${(stats.meanLossPerEvent / 1e3).toFixed(2)}K`);
  console.log(`   Annualized Rate:     ${(stats.annualizedBadDebtRate * 100).toFixed(4)}%`);
  
  if (events.length > 0) {
    console.log('\n   Recent Events:');
    events.slice(-3).forEach(e => {
      const date = new Date(e.timestamp).toLocaleDateString();
      console.log(`   - ${date}: ${(e.lossPercentage * 100).toFixed(4)}% loss (${e.reason})`);
    });
  }
  
  console.log();
  
  return {
    ...stats,
    historicalEvents: events
  };
}

/**
 * Get expected bad debt parameter (δ) for Monte Carlo simulation
 * Returns mean and std dev of bad debt rate
 */
export function getBadDebtParameters(
  badDebtHistory: BadDebtStatistics
): { delta: number; deltaStd: number } {
  const delta = badDebtHistory.annualizedBadDebtRate;
  
  // Estimate std dev from event variability
  if (badDebtHistory.eventCount === 0) {
    return { delta: 0, deltaStd: 0 };
  }
  
  const lossPercentages = badDebtHistory.historicalEvents.map(e => e.lossPercentage);
  const mean = lossPercentages.reduce((a, b) => a + b, 0) / lossPercentages.length;
  const variance = lossPercentages.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / lossPercentages.length;
  const deltaStd = Math.sqrt(variance) * Math.sqrt(badDebtHistory.eventsPerYear);
  
  return { delta, deltaStd };
}

// Export types
export type { BadDebtEvent, BadDebtStatistics };
