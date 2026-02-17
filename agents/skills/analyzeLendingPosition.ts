/**
 * analyzeLendingPosition.ts
 * 
 * Monte Carlo simulation for lending position analysis
 * 
 * V_final = V_initial * (1 + supplyAPY * time)^n - gasCosts - badDebtLosses
 * 
 * Where:
 * - supplyAPY depends on utilization rate U
 * - U is estimated from historical data
 * - badDebtLosses (δ) from historical bad debt events
 * - n = number of harvest periods (optimize h)
 */

import type { InterestRateModel } from './GetKinks';
import type { UtilizationStatistics } from './GetUtilizationRateHistory';
import type { BadDebtStatistics } from './GetBadDebtHistory';
import { calculateSupplyAPY, calculateBorrowAPY } from './GetKinks';

// Constants
const BLOCKS_PER_DAY_BSC = 28800;  // BSC: ~3s per block
const BLOCKS_PER_DAY_ETH = 7200;   // Ethereum: ~12s per block
const DEFAULT_GAS_PRICE_GWEI = 3;  // BSC
const DEFAULT_GAS_UNITS = 200_000; // Typical supply/withdraw transaction

interface LendingPositionConfig {
  V_initial: number;      // Initial supply amount (USD)
  period: number;         // Holding period (days)
  harvestFrequency?: number; // Harvest frequency (days), will be optimized if not provided
  numSimulations?: number;   // Monte Carlo simulations
}

interface LendingAnalysisResult {
  meanFinalValue: number;
  stdFinalValue: number;
  medianFinalValue: number;
  percentile5: number;
  percentile95: number;
  
  meanReturn: number;        // USD
  totalReturnPercent: number;
  annualizedAPY: number;
  
  meanSupplyAPY: number;     // Average supply APY earned
  utilizationMean: number;   // Mean utilization in scenarios
  badDebtLosses: number;     // Expected bad debt losses
  
  optimalHarvestFrequency: number; // days
  totalGasCost: number;
  harvestCount: number;
  
  // Risk metrics
  probabilityOfLoss: number;
  maxDrawdown: number;
  sharpeRatio: number;
  
  // Monte Carlo distribution
  scenarios: {
    finalValue: number;
    return: number;
    supplyAPY: number;
    badDebtLoss: number;
    utilization: number;
  }[];
}

/**
 * Generate a random utilization rate based on historical statistics
 */
function generateRandomUtilization(stats: UtilizationStatistics): number {
  // Use normal distribution with mean and std from historical data
  const u = Math.random();
  const v = Math.random();
  
  // Box-Muller transform for normal distribution
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  const utilization = stats.mean + z * stats.std;
  
  // Clamp to realistic range [0.05, 0.98]
  return Math.max(0.05, Math.min(0.98, utilization));
}

/**
 * Generate bad debt event (Bernoulli trial)
 * 
 * Bad debt is a discrete shock event with fixed magnitude distribution,
 * not a rate that accumulates over time.
 */
function generateBadDebtLoss(
  V_current: number,
  badDebtStats: BadDebtStatistics,
  days: number
): number {
  // Probability of bad debt event occurring (duration affects probability, not severity)
  const eventProbability = (badDebtStats.eventsPerYear / 365) * days;
  
  if (Math.random() < eventProbability) {
    // Bad debt event occurred - severity is independent of duration
    // Use annualized rate as base severity (typical range 3-8% per event)
    const baseSeverity = badDebtStats.annualizedBadDebtRate;
    const variability = 0.5 + Math.random(); // 0.5x to 1.5x expected loss
    return V_current * baseSeverity * variability;
  }
  
  return 0;
}

/**
 * Calculate gas costs for lending operations
 */
function calculateGasCosts(
  harvestFrequency: number,
  period: number,
  gasPrice: number,
  nativePrice: number,
  gasUnits: number = DEFAULT_GAS_UNITS
): number {
  const numHarvests = Math.floor(period / harvestFrequency);
  const gasCostPerTx = (gasUnits * gasPrice / 1e9) * nativePrice;
  
  // Initial supply + harvests + final withdrawal
  const totalTransactions = 1 + numHarvests + 1;
  
  return gasCostPerTx * totalTransactions;
}

/**
 * Simulate single lending scenario
 */
function simulateScenario(
  config: LendingPositionConfig,
  utilizationStats: UtilizationStatistics,
  rateModel: InterestRateModel,
  badDebtStats: BadDebtStatistics,
  harvestFrequency: number,
  gasPrice: number,
  nativePrice: number
): {
  finalValue: number;
  return: number;
  supplyAPY: number;
  badDebtLoss: number;
  utilization: number;
} {
  const { V_initial, period } = config;
  
  let V_current = V_initial;
  let totalBadDebtLoss = 0;
  let cumulativeSupplyAPY = 0;
  let cumulativeUtilization = 0;
  let numPeriods = 0;
  
  // Simulate over harvest periods
  const numHarvests = Math.floor(period / harvestFrequency);
  
  for (let i = 0; i <= numHarvests; i++) {
    // Generate random utilization for this period
    const utilization = generateRandomUtilization(utilizationStats);
    cumulativeUtilization += utilization;
    
    // Calculate supply APY for this utilization
    const supplyAPY = calculateSupplyAPY(utilization, rateModel);
    cumulativeSupplyAPY += supplyAPY;
    numPeriods++;
    
    // Calculate return for this period
    const periodDays = Math.min(harvestFrequency, period - i * harvestFrequency);
    if (periodDays <= 0) break;
    
    // CORRECT ORDER: Bad debt first (affects capital), then interest on remaining capital
    const badDebtLoss = generateBadDebtLoss(V_current, badDebtStats, periodDays);
    if (badDebtLoss > 0) {
      V_current -= badDebtLoss;
      totalBadDebtLoss += badDebtLoss;
    }
    
    // Interest accrues on capital after bad debt event
    const periodReturn = supplyAPY * (periodDays / 365);
    V_current = V_current * (1 + periodReturn);
  }
  
  // Subtract gas costs
  const gasCost = calculateGasCosts(harvestFrequency, period, gasPrice, nativePrice);
  V_current -= gasCost;
  
  const meanSupplyAPY = cumulativeSupplyAPY / numPeriods;
  const meanUtilization = cumulativeUtilization / numPeriods;
  
  return {
    finalValue: V_current,
    return: V_current - V_initial,
    supplyAPY: meanSupplyAPY,
    badDebtLoss: totalBadDebtLoss,
    utilization: meanUtilization
  };
}

/**
 * Run Monte Carlo simulation
 */
function runMonteCarloSimulation(
  config: LendingPositionConfig,
  utilizationStats: UtilizationStatistics,
  rateModel: InterestRateModel,
  badDebtStats: BadDebtStatistics,
  harvestFrequency: number,
  gasPrice: number,
  nativePrice: number,
  numSimulations: number
): LendingAnalysisResult['scenarios'] {
  const scenarios: LendingAnalysisResult['scenarios'] = [];
  
  for (let i = 0; i < numSimulations; i++) {
    const scenario = simulateScenario(
      config,
      utilizationStats,
      rateModel,
      badDebtStats,
      harvestFrequency,
      gasPrice,
      nativePrice
    );
    scenarios.push(scenario);
  }
  
  return scenarios;
}

/**
 * Calculate statistics from scenarios
 */
function calculateStatistics(
  scenarios: LendingAnalysisResult['scenarios'],
  config: LendingPositionConfig,
  harvestFrequency: number,
  gasPrice: number,
  nativePrice: number
): LendingAnalysisResult {
  const finalValues = scenarios.map(s => s.finalValue);
  const returns = scenarios.map(s => s.return);
  const supplyAPYs = scenarios.map(s => s.supplyAPY);
  
  // Sort for percentiles
  const sortedValues = [...finalValues].sort((a, b) => a - b);
  const sortedReturns = [...returns].sort((a, b) => a - b);
  
  const meanFinalValue = finalValues.reduce((a, b) => a + b, 0) / finalValues.length;
  const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const meanSupplyAPY = supplyAPYs.reduce((a, b) => a + b, 0) / supplyAPYs.length;
  
  // Standard deviation
  const variance = finalValues.reduce((sum, val) => 
    sum + Math.pow(val - meanFinalValue, 2), 0) / finalValues.length;
  const stdFinalValue = Math.sqrt(variance);
  
  // Percentiles
  const percentile5 = sortedValues[Math.floor(sortedValues.length * 0.05)];
  const percentile95 = sortedValues[Math.floor(sortedValues.length * 0.95)];
  const medianFinalValue = sortedValues[Math.floor(sortedValues.length * 0.5)];
  
  // Risk metrics
  const probabilityOfLoss = returns.filter(r => r < 0).length / returns.length;
  const maxDrawdown = Math.min(...returns);
  
  // Sharpe ratio (assuming risk-free rate = 0) - CORRECTED: use return percentages
  const totalReturnPercent = (meanReturn / config.V_initial) * 100;
  const returnPercentages = returns.map(r => (r / config.V_initial) * 100);
  const stdReturnPercent = Math.sqrt(returnPercentages.reduce((sum, r) => 
    sum + Math.pow(r - totalReturnPercent, 2), 0) / returnPercentages.length);
  const sharpeRatio = stdReturnPercent > 0 ? totalReturnPercent / stdReturnPercent : 0;
  
  // Other metrics
  // Annualized APY - CORRECTED: use compound formula
  const annualizedAPY = (Math.pow(meanFinalValue / config.V_initial, 365 / config.period) - 1) * 100;
  
  const badDebtLosses = scenarios.reduce((sum, s) => sum + s.badDebtLoss, 0) / scenarios.length;
  const totalGasCost = calculateGasCosts(harvestFrequency, config.period, gasPrice, nativePrice);
  const harvestCount = Math.floor(config.period / harvestFrequency);
  
  // Calculate mean utilization from scenarios
  const utilizationMean = scenarios.reduce((sum, s) => sum + s.utilization, 0) / scenarios.length;
  
  return {
    meanFinalValue,
    stdFinalValue,
    medianFinalValue,
    percentile5,
    percentile95,
    
    meanReturn,
    totalReturnPercent,
    annualizedAPY,
    
    meanSupplyAPY: meanSupplyAPY * 100, // Convert to percentage
    utilizationMean,
    badDebtLosses,
    
    optimalHarvestFrequency: harvestFrequency,
    totalGasCost,
    harvestCount,
    
    probabilityOfLoss,
    maxDrawdown,
    sharpeRatio,
    
    scenarios
  };
}

/**
 * Optimize harvest frequency
 */
function optimizeHarvestFrequency(
  config: LendingPositionConfig,
  utilizationStats: UtilizationStatistics,
  rateModel: InterestRateModel,
  badDebtStats: BadDebtStatistics,
  gasPrice: number,
  nativePrice: number,
  numSimulations: number
): { optimalFrequency: number; maxReturn: number } {
  const harvestFrequencies = [1, 7, 14, 30]; // Test daily, weekly, bi-weekly, monthly
  let optimalFrequency = 30;
  let maxReturn = -Infinity;
  
  for (const freq of harvestFrequencies) {
    const scenarios = runMonteCarloSimulation(
      config,
      utilizationStats,
      rateModel,
      badDebtStats,
      freq,
      gasPrice,
      nativePrice,
      numSimulations
    );
    
    const meanReturn = scenarios.reduce((sum, s) => sum + s.return, 0) / scenarios.length;
    
    if (meanReturn > maxReturn) {
      maxReturn = meanReturn;
      optimalFrequency = freq;
    }
  }
  
  return { optimalFrequency, maxReturn };
}

/**
 * Main analysis function for lending positions
 */
export async function analyzeLendingPosition(
  config: LendingPositionConfig,
  utilizationStats: UtilizationStatistics,
  rateModel: InterestRateModel,
  badDebtStats: BadDebtStatistics,
  gasPrice: number = DEFAULT_GAS_PRICE_GWEI,
  nativePrice: number = 600  // BNB price
): Promise<LendingAnalysisResult> {
  const numSimulations = config.numSimulations || 1000;
  
  console.log(`\n🎲 Running Monte Carlo simulation (${numSimulations} scenarios)...`);
  
  // Optimize harvest frequency if not provided
  let harvestFrequency = config.harvestFrequency;
  
  if (!harvestFrequency) {
    console.log('   Optimizing harvest frequency...');
    const optimization = optimizeHarvestFrequency(
      config,
      utilizationStats,
      rateModel,
      badDebtStats,
      gasPrice,
      nativePrice,
      numSimulations / 4  // Use fewer simulations for optimization
    );
    harvestFrequency = optimization.optimalFrequency;
    console.log(`   ✅ Optimal harvest frequency: ${harvestFrequency} days`);
  }
  
  // Run full Monte Carlo simulation
  console.log(`   Running ${numSimulations} simulations...`);
  const scenarios = runMonteCarloSimulation(
    config,
    utilizationStats,
    rateModel,
    badDebtStats,
    harvestFrequency,
    gasPrice,
    nativePrice,
    numSimulations
  );
  
  // Calculate statistics
  const result = calculateStatistics(
    scenarios,
    config,
    harvestFrequency,
    gasPrice,
    nativePrice
  );
  
  console.log('   ✅ Simulation complete\n');
  
  return result;
}

// Export types
export type { LendingPositionConfig, LendingAnalysisResult };
