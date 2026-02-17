/**
 * run_LPV2.ts - Execute Monte Carlo simulation for LP V2 positions
 * 
 * Can be used as:
 * 1. Script: tsx agents/skills/run_LPV2.ts
 * 2. Library: import { analyzeLPV2Position } from './run_LPV2.js'
 */

import { 
  monteCarloSimulation,
  estimateLogReturnParameters,
} from './analyzePool-LPV2.js';
import { 
  getPriceRatioTimeSeries,
} from './getPriceHistory.js';
import { getPancakeSwapPoolData } from './GetPoolData_2.0.js';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

/**
 * Configuration interface for LP V2 analysis
 */
export interface LPV2AnalysisConfig {
  // Investment parameters
  V_INITIAL: number;        // Initial investment in USD
  PERIOD_DAYS: number;      // Investment period in days
  
  // Currency pair
  ASSET_1: string;          // First asset (e.g., 'ETH', 'BNB', 'BTC')
  ASSET_2: string;          // Second asset (e.g., 'BUSD', 'USDT', 'BNB')
  
  // Monte Carlo settings
  NUM_SIMULATIONS: number;  // Number of scenarios
}

/**
 * Result interface for LP V2 analysis
 */
export interface LPV2AnalysisResult {
  pair: string;
  initialInvestment: number;
  period: number;
  expectedFinalValue: number;
  expectedReturn: number;
  expectedReturnPercent: number;
  annualizedAPY: number;
  risk: number;
  standardDeviation: number;
  medianVFinal: number;
  probabilityOfLoss: number;
  probabilityOfProfit: number;
  worstCase5Percentile: number;
  bestCase5Percentile: number;
  percentile25: number;
  percentile75: number;
  valueAtRisk5: number;
  mu: number;
  sigma: number;
  dataSource: string;
  numSimulations: number;
  poolInfo: {
    name: string;
    tvl: number;
    volume24h: number;
    hasFarming: boolean;
  };
}

// ============================================================================
// CONFIGURATION - Modify these constants for script execution
// ============================================================================

const CONFIG: LPV2AnalysisConfig = {
  // Investment parameters
  V_INITIAL: 100,        // Initial investment in USD
  PERIOD_DAYS: 365,         // Investment period in days
  
  // Currency pair
  ASSET_1: 'USDT',          // First asset (e.g., 'ETH', 'BNB', 'BTC')
  ASSET_2: 'WBNB',         // Second asset (e.g., 'BUSD', 'USDT', 'BNB')
  
  // Monte Carlo settings
  NUM_SIMULATIONS: 1000,   // Number of scenarios (1000 recommended)
};

// ============================================================================
// Main Analysis Function (Exportable)
// ============================================================================

/**
 * Analyze LP V2 position with Monte Carlo simulation
 * @param V_INITIAL - Initial investment in USD
 * @param PERIOD_DAYS - Investment period in days
 * @param ASSET_1 - First asset of the pair
 * @param ASSET_2 - Second asset of the pair
 * @param NUM_SIMULATIONS - Number of Monte Carlo scenarios
 * @param verbose - Whether to log progress to console (default: true)
 * @returns Analysis result with statistics and pool information
 */
export async function analyzeLPV2Position(
  V_INITIAL: number,
  PERIOD_DAYS: number,
  ASSET_1: string,
  ASSET_2: string,
  NUM_SIMULATIONS: number,
  verbose: boolean = true
): Promise<LPV2AnalysisResult> {
  // Set HISTORICAL_DAYS equal to PERIOD_DAYS
  const HISTORICAL_DAYS = PERIOD_DAYS;
  
  if (verbose) {
    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║         Monte Carlo Simulation - LP V2 Analysis               ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    
    console.log('Configuration:');
    console.log(`  Pair:              ${ASSET_1}-${ASSET_2}`);
    console.log(`  Initial Investment: $${V_INITIAL.toLocaleString()}`);
    console.log(`  Period:            ${PERIOD_DAYS} days`);
    console.log(`  Simulations:       ${NUM_SIMULATIONS}`);
    console.log(`  Historical Data:   ${HISTORICAL_DAYS} days\n`);
  }
  
  // Step 1: Fetch historical prices and estimate parameters
  if (verbose) {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('STEP 1: Fetching Historical Data & Estimating Parameters');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`⏳ Fetching ${HISTORICAL_DAYS}-day price history for ${ASSET_1}/${ASSET_2}...\n`);
  }
  
  const priceRatios = await getPriceRatioTimeSeries(
    ASSET_1, 
    ASSET_2, 
    HISTORICAL_DAYS
  );
  
  if (!priceRatios) {
    throw new Error(`Failed to retrieve historical data for ${ASSET_1}/${ASSET_2}. CoinGecko API may be unavailable or the tokens may not be supported.`);
  }
  
  if (verbose) {
    console.log(`✅ Retrieved ${priceRatios.length} price points\n`);
  }
  
  const params = estimateLogReturnParameters(priceRatios);
  
  const mu = params.mu;
  const sigma = params.sigma;
  const dataSource = 'Historical (CoinGecko)';
  
  if (verbose) {
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
  }
    
  // Step 2: Fetch pool data
  if (verbose) {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('STEP 2: Fetching Pool Data');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log(`⏳ Searching for ${ASSET_1}-${ASSET_2} pool...\n`);
  }
  
  const pools = await getPancakeSwapPoolData(1000);
  const targetPool = pools.find(p => 
    p.exogenousParams &&
    (
      (p.assets.includes(ASSET_1) && p.assets.includes(ASSET_2)) ||
      (p.assets.includes(`W${ASSET_1}`) && p.assets.includes(ASSET_2)) ||
      (p.assets.includes(ASSET_1) && p.assets.includes(`W${ASSET_2}`))
    )
  );
  
  if (!targetPool || !targetPool.exogenousParams) {
    throw new Error(`Pool ${ASSET_1}-${ASSET_2} not found on PancakeSwap. Please verify the asset names or try a different pair.`);
  }
  
  const hasFarming = targetPool.exogenousParams.TVL_stack > 0 && 
                    targetPool.exogenousParams.w_pair_ratio > 0;
  
  if (verbose) {
    console.log(`✅ Found pool: ${targetPool.name}`);
    console.log(`   TVL: $${(targetPool.exogenousParams.TVL_lp / 1e6).toFixed(2)}M`);
    console.log(`   24h Volume: $${(targetPool.exogenousParams.V_24h / 1e6).toFixed(2)}M`);
    console.log(`   Farming: ${hasFarming ? 'Yes' : 'No'}\n`);
  }
  
  const poolParams = targetPool.exogenousParams;
    
  // Step 3: Run Monte Carlo simulation
  if (verbose) {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`STEP 3: Running Monte Carlo (${NUM_SIMULATIONS} simulations)`);
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('⏳ Simulating...\n');
  }
  
  const result = monteCarloSimulation(
    {
      V_initial: V_INITIAL,
      days: PERIOD_DAYS,
    },
    poolParams,
    { mu, sigma },
    NUM_SIMULATIONS
  );
  
  // Build result object
  const analysisResult: LPV2AnalysisResult = {
    pair: `${ASSET_1}-${ASSET_2}`,
    initialInvestment: V_INITIAL,
    period: PERIOD_DAYS,
    expectedFinalValue: result.meanVFinal,
    expectedReturn: result.meanReturn,
    expectedReturnPercent: result.meanReturnPercent,
    annualizedAPY: (result.meanReturnPercent / PERIOD_DAYS) * 365,
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
    poolInfo: {
      name: targetPool.name,
      tvl: targetPool.exogenousParams.TVL_lp,
      volume24h: targetPool.exogenousParams.V_24h,
      hasFarming,
    },
  };
  
  // Save results to JSON file
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `LPV2_${ASSET_1}-${ASSET_2}_${PERIOD_DAYS}d_${timestamp}.json`;
    const outputDir = join(process.cwd(), 'agents', 'json_store_positions');
    const outputPath = join(outputDir, filename);
    
    // Ensure directory exists
    await mkdir(outputDir, { recursive: true });
    
    // Write JSON file
    await writeFile(outputPath, JSON.stringify(analysisResult, null, 2), 'utf-8');
    
    if (verbose) {
      console.log(`\n💾 Results saved to: ${filename}`);
    }
  } catch (saveError) {
    if (verbose) {
      console.warn('\n⚠️  Failed to save results to file:', saveError instanceof Error ? saveError.message : saveError);
    }
    // Don't throw - saving is optional, analysis succeeded
  }
  
  // Display results if verbose
  if (verbose) {
    console.log(JSON.stringify(analysisResult, null, 2));
  }
  
  return analysisResult;
}

// ============================================================================
// Script Execution (when run directly)
// ============================================================================

async function main() {
  try {
    const result = await analyzeLPV2Position(
      CONFIG.V_INITIAL,
      CONFIG.PERIOD_DAYS,
      CONFIG.ASSET_1,
      CONFIG.ASSET_2,
      CONFIG.NUM_SIMULATIONS,
      true
    );
    // Result is already logged by analyzeLPV2Position when verbose=true
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    console.error('\nStack trace:', error instanceof Error ? error.stack : '');
    process.exit(1);
  }
}

// Execute if run as script
main().catch(console.error);
