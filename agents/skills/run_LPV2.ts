/**
 * run.ts - Execute Monte Carlo simulation with predefined constants
 * 
 * Configure your parameters below and run with: tsx agents/skills/run.ts
 */

import { 
  monteCarloSimulation,
  estimateLogReturnParameters,
} from './analyzePool-LPV2.js';
import { 
  getPriceRatioTimeSeries,
} from './getPriceHistory.js';
import { getPancakeSwapPoolData } from './getPoolData.js';

// ============================================================================
// CONFIGURATION - Modify these constants
// ============================================================================

const CONFIG = {
  // Investment parameters
  V_INITIAL: 100,        // Initial investment in USD
  PERIOD_DAYS: 365,         // Investment period in days
  
  // Currency pair
  ASSET_1: 'USDT',          // First asset (e.g., 'ETH', 'BNB', 'BTC')
  ASSET_2: 'WBNB',         // Second asset (e.g., 'BUSD', 'USDT', 'BNB')
  
  // Monte Carlo settings
  NUM_SIMULATIONS: 1000,   // Number of scenarios (1000 recommended)
  HISTORICAL_DAYS: 365,     // Days of historical data for parameter estimation
  
  // Optional: Manual parameters (if historical data fails)
  FALLBACK_MU: 0.0001,     // Daily drift (0.01%)
  FALLBACK_SIGMA: 0.02,    // Daily volatility (2%)
};

// ============================================================================
// Main Execution
// ============================================================================

async function runMonteCarloSimulation() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║         Monte Carlo Simulation - Automated Run                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  console.log('Configuration:');
  console.log(`  Pair:              ${CONFIG.ASSET_1}-${CONFIG.ASSET_2}`);
  console.log(`  Initial Investment: $${CONFIG.V_INITIAL.toLocaleString()}`);
  console.log(`  Period:            ${CONFIG.PERIOD_DAYS} days`);
  console.log(`  Simulations:       ${CONFIG.NUM_SIMULATIONS}`);
  console.log(`  Historical Data:   ${CONFIG.HISTORICAL_DAYS} days\n`);
  
  try {
    // Step 1: Fetch historical prices and estimate parameters
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('STEP 1: Fetching Historical Data & Estimating Parameters');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    console.log(`⏳ Fetching ${CONFIG.HISTORICAL_DAYS}-day price history for ${CONFIG.ASSET_1}/${CONFIG.ASSET_2}...\n`);
    
    const priceRatios = await getPriceRatioTimeSeries(
      CONFIG.ASSET_1, 
      CONFIG.ASSET_2, 
      CONFIG.HISTORICAL_DAYS
    );
    
    if (!priceRatios) {
      throw new Error(`Failed to retrieve historical data for ${CONFIG.ASSET_1}/${CONFIG.ASSET_2}. CoinGecko API may be unavailable or the tokens may not be supported.`);
    }
    
    console.log(`✅ Retrieved ${priceRatios.length} price points\n`);
    
    const params = estimateLogReturnParameters(priceRatios);
    
    const mu = params.mu;
    const sigma = params.sigma;
    const dataSource = 'Historical (CoinGecko)';
    
    console.log('Distribution Parameters Estimated:');
    console.log(`  Daily μ (drift):       ${(params.mu * 100).toFixed(4)}%`);
    console.log(`  Daily σ (volatility):  ${(params.sigma * 100).toFixed(2)}%`);
    console.log(`  Annualized drift:      ${(params.annualizedMu * 100).toFixed(2)}%`);
    console.log(`  Annualized volatility: ${(params.annualizedSigma * 100).toFixed(2)}%`);
    console.log(`  Sample size:           ${params.sampleSize} days\n`);
    
    // Interpret volatility
    const annualVol = params.annualizedSigma * 100;
    if (annualVol < 20) {
      console.log('📊 VOLATILITY: Low (stable pair)');
    } else if (annualVol < 50) {
      console.log('📊 VOLATILITY: Moderate');
    } else if (annualVol < 100) {
      console.log('📊 VOLATILITY: High (volatile pair)');
    } else {
      console.log('📊 VOLATILITY: Very High (extremely volatile!)');
    }
    console.log();
    
    // Step 2: Fetch pool data
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('STEP 2: Fetching Pool Data');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    console.log(`⏳ Searching for ${CONFIG.ASSET_1}-${CONFIG.ASSET_2} pool...\n`);
    
    const pools = await getPancakeSwapPoolData(1000);
    const targetPool = pools.find(p => 
      p.exogenousParams &&
      (
        (p.assets.includes(CONFIG.ASSET_1) && p.assets.includes(CONFIG.ASSET_2)) ||
        (p.assets.includes(`W${CONFIG.ASSET_1}`) && p.assets.includes(CONFIG.ASSET_2)) ||
        (p.assets.includes(CONFIG.ASSET_1) && p.assets.includes(`W${CONFIG.ASSET_2}`))
      )
    );
    
    if (!targetPool || !targetPool.exogenousParams) {
      throw new Error(`Pool ${CONFIG.ASSET_1}-${CONFIG.ASSET_2} not found on PancakeSwap. Please verify the asset names or try a different pair.`);
    }
    
    console.log(`✅ Found pool: ${targetPool.name}`);
    console.log(`   TVL: $${(targetPool.exogenousParams.TVL_lp / 1e6).toFixed(2)}M`);
    console.log(`   24h Volume: $${(targetPool.exogenousParams.V_24h / 1e6).toFixed(2)}M`);
    
    const hasFarming = targetPool.exogenousParams.TVL_stack > 0 && 
                      targetPool.exogenousParams.w_pair_ratio > 0;
    console.log(`   Farming: ${hasFarming ? 'Yes' : 'No'}\n`);
    
    const poolParams = targetPool.exogenousParams;
    
    // Step 3: Run Monte Carlo simulation
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`STEP 3: Running Monte Carlo (${CONFIG.NUM_SIMULATIONS} simulations)`);
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    console.log('⏳ Simulating...\n');
    
    const result = monteCarloSimulation(
      {
        V_initial: CONFIG.V_INITIAL,
        days: CONFIG.PERIOD_DAYS,
      },
      poolParams,
      { mu, sigma },
      CONFIG.NUM_SIMULATIONS
    );
    
    // Step 4: Display results
    displayResults(result, dataSource);
    
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    console.error('\nStack trace:', error instanceof Error ? error.stack : '');
  }
}

/**
 * Display Monte Carlo results
 */
function displayResults(result: any, dataSource: string) {
  // Export results summary as JSON only
  const summary = {
    pair: `${CONFIG.ASSET_1}-${CONFIG.ASSET_2}`,
    initialInvestment: CONFIG.V_INITIAL,
    period: CONFIG.PERIOD_DAYS,
    expectedFinalValue: result.meanVFinal,
    expectedReturn: result.meanReturn,
    expectedReturnPercent: result.meanReturnPercent,
    annualizedAPY: (result.meanReturnPercent / CONFIG.PERIOD_DAYS) * 365,
    risk: result.stdDevReturn,
    standardDeviation: result.stdDevVFinal,
    medianVFinal: result.medianVFinal,
    probabilityOfLoss: result.probabilityOfLoss,
    probabilityOfProfit: 1 - result.probabilityOfLoss,
    worstCase5Percentile: result.percentile5,
    bestCase5Percentile: result.percentile95,
    percentile25: result.percentile25,
    percentile75: result.percentile75,
    valueAtRisk5: result.valueAtRisk5,
    mu: result.distributionParams.mu,
    sigma: result.distributionParams.sigma,
    dataSource: dataSource,
    numSimulations: result.numSimulations,
  };
  
  console.log(JSON.stringify(summary, null, 2));
}

// Run the simulation
runMonteCarloSimulation();
