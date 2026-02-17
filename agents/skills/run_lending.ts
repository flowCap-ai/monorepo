/**
 * run_lending.ts
 * 
 * Execution script for lending position Monte Carlo analysis
 * User parameters defined as constants
 * 
 * Usage: npx tsx agents/skills/run_lending.ts
 */

import { getUtilizationRateHistory } from './GetUtilizationRateHistory';
import { getBadDebtHistory, getBadDebtParameters } from './GetBadDebtHistory';
import { getKinks } from './GetKinks';
import { analyzeLendingPosition } from './analyzeLendingPosition';
import * as fs from 'fs';
import * as path from 'path';

// ═══════════════════════════════════════════════════════════════
// USER CONFIGURATION - Edit these constants
// ═══════════════════════════════════════════════════════════════

const CONFIG = {
  // Position parameters
  V_INITIAL: 10_000,      // Initial supply amount (USD)
  PERIOD_DAYS: 30,        // Holding period (days)
  
  // Protocol and asset
  PROTOCOL: 'Venus',      // Options: "Venus", "Aave", "Compound"
  ASSET: 'USDT',          // Asset to supply (e.g., "USDT", "USDC", "BNB")
  CHAIN: 'BSC',           // Blockchain (e.g., "BSC", "Ethereum", "Polygon")
  
  // Monte Carlo settings
  NUM_SIMULATIONS: 1000,  // Number of scenarios to simulate
  HISTORICAL_DAYS: 365,   // Days of historical data to analyze
  
  // Gas settings (optional - defaults will be used if not specified)
  GAS_PRICE_GWEI: 3,      // Gas price in Gwei
  NATIVE_PRICE_USD: 600,  // Native token price (BNB, ETH, etc.) in USD
  
  // Harvest frequency (optional - will be optimized if not specified)
  HARVEST_FREQUENCY_DAYS: undefined as number | undefined,  // Options: 1, 7, 14, 30, or undefined for auto-optimization
};

// ═══════════════════════════════════════════════════════════════
// Main Execution
// ═══════════════════════════════════════════════════════════════

async function main() {
  try {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('LENDING POSITION MONTE CARLO ANALYSIS');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    console.log('Configuration:');
    console.log(`  Protocol:        ${CONFIG.PROTOCOL}`);
    console.log(`  Asset:           ${CONFIG.ASSET}`);
    console.log(`  Chain:           ${CONFIG.CHAIN}`);
    console.log(`  Initial Supply:  $${CONFIG.V_INITIAL.toLocaleString()}`);
    console.log(`  Period:          ${CONFIG.PERIOD_DAYS} days`);
    console.log(`  Simulations:     ${CONFIG.NUM_SIMULATIONS}`);
    console.log(`  Historical Data: ${CONFIG.HISTORICAL_DAYS} days\n`);
    
    // Step 1: Fetch interest rate model (kinks)
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('STEP 1: Fetching Interest Rate Model');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    const kinks = await getKinks(CONFIG.PROTOCOL, CONFIG.ASSET, CONFIG.CHAIN);
    
    // Step 2: Fetch utilization rate history
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('STEP 2: Analyzing Utilization Rate History');
    console.log('═══════════════════════════════════════════════════════════════');
    
    const utilizationStats = await getUtilizationRateHistory(
      CONFIG.PROTOCOL,
      CONFIG.ASSET,
      CONFIG.HISTORICAL_DAYS
    );
    
    // Step 3: Fetch bad debt history
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('STEP 3: Analyzing Bad Debt Risk');
    console.log('═══════════════════════════════════════════════════════════════');
    
    const badDebtStats = await getBadDebtHistory(
      CONFIG.PROTOCOL,
      CONFIG.ASSET,
      CONFIG.HISTORICAL_DAYS,
      CONFIG.V_INITIAL  // Use position size for loss calculation
    );
    
    const { delta, deltaStd } = getBadDebtParameters(badDebtStats);
    console.log(`\n📊 Bad Debt Parameters for Simulation:`);
    console.log(`   Delta (δ):     ${(delta * 100).toFixed(4)}% per year`);
    console.log(`   Delta Std:     ${(deltaStd * 100).toFixed(4)}%\n`);
    
    // Step 4: Run Monte Carlo simulation
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`STEP 4: Running Monte Carlo Simulation`);
    console.log('═══════════════════════════════════════════════════════════════');
    
    const analysis = await analyzeLendingPosition(
      {
        V_initial: CONFIG.V_INITIAL,
        period: CONFIG.PERIOD_DAYS,
        harvestFrequency: CONFIG.HARVEST_FREQUENCY_DAYS,
        numSimulations: CONFIG.NUM_SIMULATIONS
      },
      utilizationStats,
      kinks.model,
      badDebtStats,
      CONFIG.GAS_PRICE_GWEI,
      CONFIG.NATIVE_PRICE_USD
    );
    
    // Step 5: Display results
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('RESULTS');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    console.log('📈 Position Performance:');
    console.log(`   Initial Value:        $${CONFIG.V_INITIAL.toLocaleString()}`);
    console.log(`   Expected Final Value: $${analysis.meanFinalValue.toFixed(2)}`);
    console.log(`   Expected Return:      $${analysis.meanReturn.toFixed(2)} (${analysis.totalReturnPercent.toFixed(2)}%)`);
    console.log(`   Annualized APY:       ${analysis.annualizedAPY.toFixed(2)}%`);
    console.log();
    
    console.log('📊 Monte Carlo Statistics:');
    console.log(`   Mean:                 $${analysis.meanFinalValue.toFixed(2)}`);
    console.log(`   Median:               $${analysis.medianFinalValue.toFixed(2)}`);
    console.log(`   Std Deviation:        $${analysis.stdFinalValue.toFixed(2)}`);
    console.log(`   5th Percentile:       $${analysis.percentile5.toFixed(2)}`);
    console.log(`   95th Percentile:      $${analysis.percentile95.toFixed(2)}`);
    console.log();
    
    console.log('💰 Yield Breakdown:');
    console.log(`   Mean Supply APY:      ${analysis.meanSupplyAPY.toFixed(2)}%`);
    console.log(`   Mean Utilization:     ${(analysis.utilizationMean * 100).toFixed(0)}%`);
    console.log(`   Bad Debt Losses:      $${analysis.badDebtLosses.toFixed(2)}`);
    console.log();
    
    console.log('🔄 Compounding Strategy:');
    console.log(`   Harvest Frequency:    Every ${analysis.optimalHarvestFrequency} days`);
    console.log(`   Total Harvests:       ${analysis.harvestCount}`);
    console.log(`   Total Gas Cost:       $${analysis.totalGasCost.toFixed(2)}`);
    console.log();
    
    console.log('⚠️  Risk Metrics:');
    console.log(`   Probability of Loss:  ${(analysis.probabilityOfLoss * 100).toFixed(2)}%`);
    console.log(`   Max Drawdown:         $${analysis.maxDrawdown.toFixed(2)}`);
    console.log(`   Sharpe Ratio:         ${analysis.sharpeRatio.toFixed(3)}`);
    console.log();
    
    // Step 6: Save results to JSON in json_store_positions folder with standardized format
    const outputDir = path.join(process.cwd(), 'agents', 'json_store_positions');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `Lending_${CONFIG.PROTOCOL}_${CONFIG.ASSET}_${CONFIG.PERIOD_DAYS}d_${timestamp}.json`;
    const filepath = path.join(outputDir, filename);
    
    const output = {
      productType: 'Lending',
      timestamp: new Date().toISOString(),
      
      config: {
        protocol: CONFIG.PROTOCOL,
        asset: CONFIG.ASSET,
        chain: CONFIG.CHAIN,
        initialInvestment: CONFIG.V_INITIAL,
        periodDays: CONFIG.PERIOD_DAYS,
        numSimulations: CONFIG.NUM_SIMULATIONS,
        historicalDays: CONFIG.HISTORICAL_DAYS,
      },
      
      marketConditions: {
        interestRateModel: {
          modelType: kinks.model.modelType,
          baseRatePerYear: kinks.model.baseRatePerYear,
          multiplierPerYear: kinks.model.multiplierPerYear,
          jumpMultiplierPerYear: kinks.model.jumpMultiplierPerYear,
          kink: kinks.model.kink,
          reserveFactor: kinks.model.reserveFactor,
        },
        utilizationStatistics: {
          mean: utilizationStats.mean,
          std: utilizationStats.std,
          min: utilizationStats.min,
          max: utilizationStats.max,
          median: utilizationStats.median,
        },
        badDebtStatistics: {
          totalBadDebt: badDebtStats.totalBadDebt,
          eventCount: badDebtStats.eventCount,
          annualizedRate: badDebtStats.annualizedBadDebtRate,
          eventsPerYear: badDebtStats.eventsPerYear,
        },
      },
      
      analysis: {
        returns: {
          expectedFinalValue: analysis.meanFinalValue,
          expectedReturn: analysis.meanReturn,
          expectedReturnPercent: analysis.totalReturnPercent,
          annualizedAPY: analysis.annualizedAPY,
        },
        
        distribution: {
          mean: analysis.meanFinalValue,
          median: analysis.medianFinalValue,
          stdDeviation: analysis.stdFinalValue,
          percentile5: analysis.percentile5,
          percentile25: null, // Not provided by lending analysis
          percentile75: null, // Not provided by lending analysis
          percentile95: analysis.percentile95,
        },
        
        risk: {
          probabilityOfLoss: analysis.probabilityOfLoss,
          probabilityOfProfit: 1 - analysis.probabilityOfLoss,
          valueAtRisk5: null, // Not provided by lending analysis
          riskScore: null, // Not provided by lending analysis
          riskLevel: null, // Not provided by lending analysis
        },
        
        costs: {
          totalGasCost: analysis.totalGasCost,
          harvestCount: analysis.harvestCount,
          optimalHarvestFrequency: analysis.optimalHarvestFrequency,
        },
        
        yields: {
          meanSupplyAPY: analysis.meanSupplyAPY,
          utilizationMean: analysis.utilizationMean,
          badDebtLosses: analysis.badDebtLosses,
        },
      },
      
      productSpecific: {
        sharpeRatio: analysis.sharpeRatio,
        maxDrawdown: analysis.maxDrawdown,
      },
    };
    
    fs.writeFileSync(filepath, JSON.stringify(output, null, 2));
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`✅ Analysis complete! Results saved to: ${filename}`);
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    // Return for programmatic use
    return output;
    
  } catch (error) {
    console.error('\n❌ Error during analysis:', error);
    if (error instanceof Error) {
      console.error('   Message:', error.message);
      console.error('   Stack:', error.stack);
    }
    process.exit(1);
  }
}

// Execute main function
main().catch(console.error);

export { main };
