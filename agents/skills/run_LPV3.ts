/**
 * run_LPV3.ts - Execute Monte Carlo simulation for V3 concentrated liquidity positions
 * 
 * Configure your parameters below and run with: tsx agents/skills/run_LPV3.ts
 * 
 * Key differences from V2:
 * - Requires P_a (lower bound), P_b (upper bound), h (harvest frequency) as constants
 * - Concentrated liquidity provides higher capital efficiency
 * - Only earns fees when price is within [P_a, P_b] range
 * - Higher IL risk if price exits range
 */

import { 
  monteCarloSimulationV3,
  estimateLogReturnParameters,
  analyzeV3Position,
} from './analyzePool-LPV3.js';
import { 
  getPriceRatioTimeSeries,
} from './getPriceHistory.js';
import { getPancakeSwapPoolData } from './GetPoolData_2.0.js';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

// ============================================================================
// CONFIGURATION - Set your parameters here
// ============================================================================

const CONFIG = {
  // Basic parameters (same as V2)
  V_INITIAL: 10000,        // Initial investment in USD
  PERIOD_DAYS: 90,         // Holding period in days
  ASSET_1: 'USDT',         // Base asset (denominator)
  ASSET_2: 'WBNB',         // Quote asset (numerator)
  
  // V3 specific parameters
  P_A: 580,                // Lower price bound (concentrated liquidity range)
  P_B: 720,                // Upper price bound (concentrated liquidity range)
  H: 7,                    // Harvest frequency in days (e.g., 1=daily, 7=weekly, 30=monthly)
  FEE_TIER: 0.0025,        // Pool fee tier: 0.0001 (0.01%), 0.0005 (0.05%), 0.0025 (0.25%), 0.01 (1%)
  
  // Monte Carlo settings
  NUM_SIMULATIONS: 1000,   // Number of scenarios (1000 recommended)
  HISTORICAL_DAYS: 365,    // Days of historical data for parameter estimation
};

// ============================================================================
// Main Execution
// ============================================================================

async function runMonteCarloV3() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║    Monte Carlo Simulation V3 - Concentrated Liquidity         ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  console.log('Configuration:');
  console.log(`  Pair:              ${CONFIG.ASSET_1}-${CONFIG.ASSET_2}`);
  console.log(`  Initial Investment: $${CONFIG.V_INITIAL.toLocaleString()}`);
  console.log(`  Period:            ${CONFIG.PERIOD_DAYS} days`);
  console.log(`  Fee Tier:          ${(CONFIG.FEE_TIER * 100).toFixed(2)}%`);
  console.log(`  Simulations:       ${CONFIG.NUM_SIMULATIONS}`);
  console.log(`  Historical Data:   ${CONFIG.HISTORICAL_DAYS} days\n`);
  
  console.log('V3 Range:');
  console.log(`  P_a (lower):       ${CONFIG.P_A}`);
  console.log(`  P_b (upper):       ${CONFIG.P_B}`);
  console.log(`  h (harvest):       Every ${CONFIG.H} days\n`);
  
  try {
    // Step 1: Fetch historical prices and estimate parameters
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('STEP 1: Fetching Historical Data & Estimating Parameters');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    console.log(`⏳ Fetching ${CONFIG.HISTORICAL_DAYS}-day price history for ${CONFIG.ASSET_2}/${CONFIG.ASSET_1}...\n`);
    
    const priceRatios = await getPriceRatioTimeSeries(
      CONFIG.ASSET_1, 
      CONFIG.ASSET_2, 
      CONFIG.HISTORICAL_DAYS
    );
    
    if (!priceRatios) {
      throw new Error(`Failed to retrieve historical data for ${CONFIG.ASSET_2}/${CONFIG.ASSET_1}. CoinGecko API may be unavailable or the tokens may not be supported.`);
    }
    
    console.log(`✅ Retrieved ${priceRatios.length} price points\n`);
    
    // Calculate current price from most recent data point
    // priceRatios is ASSET_1/ASSET_2, but we want ASSET_2/ASSET_1 for display
    const priceRatio = priceRatios[priceRatios.length - 1];
    const CURRENT_PRICE = 1 / priceRatio; // Invert to get ASSET_2/ASSET_1
    console.log(`📍 Current Price P_0: ${CURRENT_PRICE.toFixed(4)} ${CONFIG.ASSET_2}/${CONFIG.ASSET_1}`);
    console.log(`   Range: [${CONFIG.P_A}, ${CONFIG.P_B}] (${((CONFIG.P_A / CURRENT_PRICE - 1) * 100).toFixed(1)}% to +${((CONFIG.P_B / CURRENT_PRICE - 1) * 100).toFixed(1)}%)\n`);
    
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
    
    // Interpret volatility for V3
    const annualVol = params.annualizedSigma * 100;
    if (annualVol < 20) {
      console.log('📊 VOLATILITY: Low (stable pair)');
      console.log('   V3 Strategy: Can use narrow range for high capital efficiency\n');
    } else if (annualVol < 50) {
      console.log('📊 VOLATILITY: Moderate');
      console.log('   V3 Strategy: Use moderate range to balance fees vs out-of-range risk\n');
    } else if (annualVol < 100) {
      console.log('📊 VOLATILITY: High (volatile pair)');
      console.log('   V3 Strategy: Consider wider range or stick with V2\n');
    } else {
      console.log('📊 VOLATILITY: Very High (extremely volatile!)');
      console.log('   V3 Strategy: ⚠️ V2 might be safer for this pair\n');
    }
    
    // Step 2: Fetch pool data
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('STEP 2: Fetching Pool Data');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    console.log(`⏳ Searching for ${CONFIG.ASSET_2}-${CONFIG.ASSET_1} V3 pool...\n`);
    
    const pools = await getPancakeSwapPoolData(1000);
    
    // Helper function to generate asset variants (with/without W prefix)
    const getAssetVariants = (asset: string): string[] => {
      const upper = asset.toUpperCase();
      if (upper.startsWith('W') && upper.length > 1) {
        // If starts with W, include both with and without W
        // e.g., WBNB → [WBNB, BNB]
        return [upper, upper.substring(1)];
      } else {
        // If doesn't start with W, include both without and with W
        // e.g., USDT → [USDT, WUSDT], BNB → [BNB, WBNB]
        return [upper, 'W' + upper];
      }
    };

    const asset1Variants = getAssetVariants(CONFIG.ASSET_1);
    const asset2Variants = getAssetVariants(CONFIG.ASSET_2);
    
    // Search for V3 pool with flexible case-insensitive matching
    const targetPool = pools.find(p => {
      if (p.version !== 'v3' || !p.exogenousParams) return false;
      
      const poolAssets = p.assets.map(a => a.toUpperCase());
      
      // Check if both assets are present (in any order, with or without W prefix)
      const hasAsset1 = poolAssets.some(a => asset1Variants.includes(a));
      const hasAsset2 = poolAssets.some(a => asset2Variants.includes(a));
      
      return hasAsset1 && hasAsset2;
    });
    
    if (!targetPool || !targetPool.exogenousParams) {
      // Debug: Show available V3 pools
      const v3Pools = pools.filter(p => p.version === 'v3').map(p => `${p.assets.join('/')}`).slice(0, 10);
      console.log(`\n📋 Available V3 pools: ${v3Pools.join(', ')}...\n`);
      throw new Error(`V3 Pool ${CONFIG.ASSET_2}-${CONFIG.ASSET_1} not found on PancakeSwap. Please verify the asset names or try a different pair.`);
    }
    
    console.log(`✅ Found V3 pool: ${targetPool.name}`);
    console.log(`   TVL: $${(targetPool.exogenousParams.TVL_lp / 1e6).toFixed(2)}M`);
    console.log(`   24h Volume: $${(targetPool.exogenousParams.V_24h / 1e6).toFixed(2)}M`);
    
    const hasFarming = targetPool.exogenousParams.TVL_stack > 0 && 
                      targetPool.exogenousParams.w_pair_ratio > 0;
    console.log(`   Farming: ${hasFarming ? 'Yes' : 'No'}`);
    console.log(`   Fee Tier: ${(CONFIG.FEE_TIER * 100).toFixed(2)}%\n`);
    
    const poolParams = targetPool.exogenousParams;
    
    // Step 3: Run Monte Carlo simulation with V3 parameters
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`STEP 3: Running Monte Carlo V3 (${CONFIG.NUM_SIMULATIONS} simulations)`);
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    console.log('📊 Running V3 Monte Carlo Analysis...');
    console.log(`   Pool: ${targetPool.name}`);
    console.log(`   Harvest: Every ${CONFIG.H} days\n`);
    
    // Run analysis with specified parameters
    const analysis = await analyzeV3Position(
      targetPool,
      CONFIG.V_INITIAL,
      {
        days: CONFIG.PERIOD_DAYS,
        P_0: CURRENT_PRICE,
        P_a: CONFIG.P_A,
        P_b: CONFIG.P_B,
        h: CONFIG.H,
        feeTier: CONFIG.FEE_TIER,
        optimizeRange: false,  // No optimization, use provided parameters
        volatility: params.annualizedSigma,
      }
    );
    
    console.log('✅ V3 Position Parameters:');
    console.log(`  P_a (lower bound):     ${CONFIG.P_A} (${((CONFIG.P_A / CURRENT_PRICE - 1) * 100).toFixed(1)}% from current)`);
    console.log(`  P_b (upper bound):     ${CONFIG.P_B} (+${((CONFIG.P_B / CURRENT_PRICE - 1) * 100).toFixed(1)}% from current)`);
    console.log(`  h (harvest freq):      Every ${CONFIG.H} days`);
    console.log(`  Range width:           ${((CONFIG.P_B - CONFIG.P_A) / CURRENT_PRICE * 100).toFixed(1)}%`);
    console.log(`  Capital efficiency:    ${analysis.capitalEfficiency.toFixed(2)}x\n`);
    
    // Step 4: Display and save results
    const summary = buildResultsSummary(analysis, dataSource, CURRENT_PRICE);
    
    // Save to JSON file
    await saveResults(summary);
    
    // Display results
    console.log('\n' + JSON.stringify(summary, null, 2));
    
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    console.error('\nStack trace:', error instanceof Error ? error.stack : '');
  }
}

/**
 * Build V3 analysis results summary object
 */
function buildResultsSummary(analysis: any, dataSource: string, currentPrice: number) {
  return {
    strategy: 'V3 Concentrated Liquidity',
    pair: `${CONFIG.ASSET_1}-${CONFIG.ASSET_2}`,
    initialInvestment: CONFIG.V_INITIAL,
    currentPrice: currentPrice.toFixed(4),
    period: CONFIG.PERIOD_DAYS,
    
    // Range parameters
    priceRange: {
      P_a: analysis.optimalPriceRange.P_a,
      P_b: analysis.optimalPriceRange.P_b,
      h: analysis.optimalPriceRange.h,
      feeTier: (CONFIG.FEE_TIER * 100).toFixed(2) + '%',
      rangeWidthPercent: (analysis.optimalPriceRange.rangeWidth * 100).toFixed(1) + '%',
      lowerBoundDistance: ((analysis.optimalPriceRange.P_a / currentPrice - 1) * 100).toFixed(1) + '%',
      upperBoundDistance: ((analysis.optimalPriceRange.P_b / currentPrice - 1) * 100).toFixed(1) + '%',
    },
    
    // V3 specific metrics
    capitalEfficiency: analysis.capitalEfficiency.toFixed(2) + 'x',
    timeInRange: analysis.timeInRange.toFixed(1) + '%',
    concentrationRisk: analysis.concentrationRisk,
    
    // Returns
    expectedFinalValue: analysis.expectedValue.toFixed(2),
    expectedReturn: analysis.totalReturn.toFixed(2),
    expectedReturnPercent: analysis.totalReturnPercent.toFixed(2) + '%',
    annualizedAPY: analysis.annualizedAPY.toFixed(2) + '%',
    
    // Component breakdown
    tradingFeeAPY: analysis.tradingFeeAPY.toFixed(2) + '%',
    farmingRewardAPY: analysis.farmingRewardAPY.toFixed(2) + '%',
    impermanentLoss: analysis.impermanentLoss.toFixed(2) + '%',
    totalGasCost: analysis.totalGasCost.toFixed(4),
    
    // Risk metrics
    riskScore: analysis.riskScore,
    riskLevel: analysis.riskLevel,
    warnings: analysis.warnings,
    priceVolatility: (analysis.priceVolatility * 100).toFixed(2) + '% daily',
    
    // Market metrics
    volumeToTVLRatio: analysis.volumeToTVLRatio.toFixed(4),
    dataSource: dataSource,
  };
}

/**
 * Save results to JSON file in json_store_positions folder
 */
async function saveResults(summary: any) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `LPV3_${CONFIG.ASSET_1}-${CONFIG.ASSET_2}_${CONFIG.PERIOD_DAYS}d_${timestamp}.json`;
    const outputDir = join(process.cwd(), 'agents', 'json_store_positions');
    const outputPath = join(outputDir, filename);
    
    // Ensure directory exists
    await mkdir(outputDir, { recursive: true });
    
    // Write JSON file
    await writeFile(outputPath, JSON.stringify(summary, null, 2), 'utf-8');
    
    console.log(`\n💾 Results saved to: ${filename}`);
  } catch (saveError) {
    console.warn('\n⚠️  Failed to save results to file:', saveError instanceof Error ? saveError.message : saveError);
    // Don't throw - saving is optional, analysis succeeded
  }
}

// Run the simulation
runMonteCarloV3();
