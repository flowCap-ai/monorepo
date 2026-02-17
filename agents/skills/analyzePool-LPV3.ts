/**
 * analyzePool-LPV3.ts - Mathematical analysis for Uniswap V3 style concentrated liquidity pools
 * 
 * Implements comprehensive yield modeling for V3 LP positions including:
 * - Concentrated liquidity within price range [P_a, P_b]
 * - Optimization of P_a, P_b, and h (harvest frequency)
 * - Impermanent Loss for concentrated positions
 * - Trading fees (only active in range)
 * - Farming rewards
 * - Monte Carlo simulation with parameter optimization
 * 
 * Key differences from V2:
 * - Liquidity is concentrated in [P_a, P_b] range
 * - Higher capital efficiency → more fees per dollar
 * - Higher IL risk if price exits range
 * - Need to optimize 3 parameters: P_a, P_b, h (harvest frequency in days)
 */

import type { DexExogenousParams, PoolData } from './getPoolData.js';

/**
 * V3 LP position analysis result
 */
export interface LPV3Analysis {
  // Core yield metrics
  expectedValue: number;           // Final value in USD after holding period
  totalReturn: number;             // Total return in USD
  totalReturnPercent: number;      // Total return as percentage
  annualizedAPY: number;           // Annualized APY (%)
  
  // Component breakdown
  impermanentLoss: number;         // IL impact (%)
  tradingFeeAPY: number;           // APY from trading fees (%)
  farmingRewardAPY: number;        // APY from farming rewards (%)
  totalGasCost: number;            // Total gas costs in USD
  
  // V3 specific metrics
  capitalEfficiency: number;       // Liquidity concentration factor
  timeInRange: number;             // % of time price was in range
  feesEarned: number;              // Total fees earned (only when in range)
  
  // Optimal parameters
  optimalPriceRange: {
    P_a: number;                   // Lower price bound
    P_b: number;                   // Upper price bound
    h: number;                     // Harvest frequency (days between harvests)
    rangeWidth: number;            // (P_b - P_a) / P_0
  };
  
  // Risk assessment
  riskScore: number;               // 0-100, higher is safer
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  warnings: string[];
  concentrationRisk: string;       // Risk of price exiting range
  
  // Market conditions
  volumeToTVLRatio: number;        // Daily volume / TVL
  currentPrice: number;            // Current market price
  priceVolatility: number;         // Historical volatility
}

/**
 * Configuration for V3 analysis
 */
export interface V3AnalysisConfig {
  days: number;                    // Holding period in days
  P_0: number;                     // Current price
  P_a?: number;                    // Lower bound (if known)
  P_b?: number;                    // Upper bound (if known)
  h?: number;                      // Harvest frequency in days (if known)
  feeTier?: number;                // Pool fee tier (0.0001, 0.0005, 0.0025, 0.01)
  optimizeRange?: boolean;         // Auto-optimize P_a, P_b, h (default: true)
  volatility?: number;             // Historical volatility (for optimization)
  priceChangeRatio?: number;       // Expected price ratio (default: 1.0)
  gasPerTransaction?: number;      // Gas units per tx
}

/**
 * Monte Carlo result for V3
 */
export interface MonteCarloResultV3 {
  meanVFinal: number;
  medianVFinal: number;
  stdDevVFinal: number;
  varianceVFinal: number;
  meanReturn: number;
  stdDevReturn: number;
  meanReturnPercent: number;
  percentile5: number;
  percentile25: number;
  percentile75: number;
  percentile95: number;
  probabilityOfLoss: number;
  valueAtRisk5: number;
  numSimulations: number;
  distributionParams: {
    mu: number;
    sigma: number;
  };
  optimalParameters: {
    P_a: number;
    P_b: number;
    h: number;
  };
  simulations: number[];
}

// Constants for PancakeSwap V3
const PANCAKESWAP_V3_FEE_TIERS = {
  '0.01': 0.0001,  // 0.01% for stablecoin pairs
  '0.05': 0.0005,  // 0.05% for correlated pairs
  '0.25': 0.0025,  // 0.25% for most pairs
  '1.00': 0.01,    // 1% for exotic pairs
};
const DEFAULT_V3_FEE_TIER = 0.0025;  // 0.25% default
const DEFAULT_GAS_PER_TX = 730;
const OPTIMIZATION_ITERATIONS = 50;  // Number of optimization attempts

/**
 * Calculate V3 position value at price P
 * 
 * Formulas:
 * - If P < P_a: Position is all in token Y (quote)
 * - If P_a ≤ P ≤ P_b: Position has both tokens
 * - If P > P_b: Position is all in token X (base)
 * 
 * Value calculation:
 * V(P) = L × (√P - √P_a) + L × (1/√P - 1/√P_b) × P
 * 
 * Where L is the liquidity amount.
 */
export function calculateV3PositionValue(
  P: number,
  P_a: number,
  P_b: number,
  L: number
): number {
  const sqrtP = Math.sqrt(P);
  const sqrtPa = Math.sqrt(P_a);
  const sqrtPb = Math.sqrt(P_b);
  
  if (P < P_a) {
    // All in token Y
    return L * (1 / sqrtPa - 1 / sqrtPb) * P;
  } else if (P > P_b) {
    // All in token X
    return L * (sqrtPb - sqrtPa) * P;
  } else {
    // Mixed position
    const amountY = L * (sqrtP - sqrtPa);
    const amountX = L * (1 / sqrtP - 1 / sqrtPb);
    return amountY + amountX * P;
  }
}

/**
 * Calculate capital efficiency multiplier for V3 vs V2
 * 
 * V3 concentrates liquidity in range, so each dollar provides more liquidity
 * Multiplier = √(P_b/P_a)
 */
export function calculateCapitalEfficiency(P_a: number, P_b: number): number {
  return Math.sqrt(P_b / P_a);
}

/**
 * Calculate impermanent loss for V3 position
 * More complex than V2 due to range constraints
 * 
 * Correct approach:
 * 1. Calculate initial token quantities (x_0, y_0) at P_0
 * 2. Calculate final pool token quantities at P_final (with rebalancing in range)
 * 3. Calculate V_pool = value of pool position at P_final
 * 4. Calculate V_hold = value of initial tokens at P_final (no rebalancing)
 * 5. IL_factor = V_pool / V_hold
 */
export function calculateV3ImpermanentLoss(
  P_0: number,
  P_final: number,
  P_a: number,
  P_b: number
): {
  factor: number;
  lossPercent: number;
  inRange: boolean;
} {
  // We use a normalized liquidity L = 1 for calculation (result is independent of L)
  const L = 1;
  
  // Calculate initial token quantities at P_0
  const sqrtP0 = Math.sqrt(P_0);
  const sqrtPa = Math.sqrt(P_a);
  const sqrtPb = Math.sqrt(P_b);
  
  let x_0: number, y_0: number;
  
  if (P_0 < P_a) {
    // All in token Y initially
    x_0 = 0;
    y_0 = L * (1 / sqrtPa - 1 / sqrtPb);
  } else if (P_0 > P_b) {
    // All in token X initially
    x_0 = L * (sqrtPb - sqrtPa);
    y_0 = 0;
  } else {
    // Mixed position
    x_0 = L * (1 / sqrtP0 - 1 / sqrtPb);
    y_0 = L * (sqrtP0 - sqrtPa);
  }
  
  // Calculate final token quantities at P_final
  const sqrtPfinal = Math.sqrt(P_final);
  let x_final: number, y_final: number;
  const inRange = P_final >= P_a && P_final <= P_b;
  
  if (P_final < P_a) {
    // All in token Y
    x_final = 0;
    y_final = L * (1 / sqrtPa - 1 / sqrtPb);
  } else if (P_final > P_b) {
    // All in token X
    x_final = L * (sqrtPb - sqrtPa);
    y_final = 0;
  } else {
    // Mixed position (rebalanced)
    x_final = L * (1 / sqrtPfinal - 1 / sqrtPb);
    y_final = L * (sqrtPfinal - sqrtPa);
  }
  
  // Calculate values at P_final
  const V_hold = x_0 * P_final + y_0;  // HODL value: initial tokens at final price
  const V_pool = x_final * P_final + y_final;  // Pool value: rebalanced tokens at final price
  
  // IL factor
  const factor = V_pool / V_hold;
  
  return {
    factor,
    lossPercent: (factor - 1) * 100,
    inRange,
  };
}

/**
 * Optimize P_a, P_b, and h for maximum expected return
 * 
 * Uses grid search approach
 * 
 * Objective: Maximize E[V_final] - Risk_penalty
 * 
 * Constraints:
 * - P_a < P_0 < P_b
 * - P_a > 0
 * - h > 0 (harvest frequency in days: 1, 7, 14, 30)
 * - Range width reasonable for volatility
 */
export function optimizeV3Parameters(
  P_0: number,
  volatility: number,
  days: number,
  V_initial: number,
  poolParams: DexExogenousParams,
  feeTier: number = DEFAULT_V3_FEE_TIER
): {
  P_a: number;
  P_b: number;
  h: number;
  expectedReturn: number;
  score: number;
} {
  let bestScore = -Infinity;
  let bestParams = { P_a: P_0 * 0.8, P_b: P_0 * 1.2, h: 0.5 };
  
  // Estimate reasonable range based on volatility
  // For daily volatility σ, 95% confidence interval is ±2σ over √days
  const priceStdDev = volatility * Math.sqrt(days);
  const confidenceMultiplier = 2; // 95% CI
  
  // Grid search over range widths
  const rangeWidths = [0.1, 0.2, 0.3, 0.5, 0.7, 1.0]; // 10% to 100% width
  const hValues = [1, 7, 14, 30]; // Harvest frequencies: daily, weekly, bi-weekly, monthly
  
  for (const width of rangeWidths) {
    for (const h of hValues) {
      // Symmetric range around P_0
      const halfWidth = width / 2;
      const P_a = P_0 * (1 - halfWidth);
      const P_b = P_0 * (1 + halfWidth);
      
      // Calculate expected return with this configuration
      const expectedReturn = simulateV3Return(
        P_0,
        P_a,
        P_b,
        h,
        volatility,
        days,
        V_initial,
        poolParams,
        feeTier
      );
      
      // Capital efficiency bonus
      const efficiency = calculateCapitalEfficiency(P_a, P_b);
      
      // Probability of staying in range (Gaussian approximation)
      const upperBreachProb = 1 - normalCDF((Math.log(P_b / P_0)) / (volatility * Math.sqrt(days)));
      const lowerBreachProb = normalCDF((Math.log(P_a / P_0)) / (volatility * Math.sqrt(days)));
      const inRangeProb = 1 - upperBreachProb - lowerBreachProb;
      
      // Score = Expected Return × In-Range Probability × Efficiency Bonus - Risk Penalty
      const riskPenalty = (1 - inRangeProb) * V_initial * 0.1; // 10% penalty for out-of-range
      const score = expectedReturn * inRangeProb * Math.log(efficiency) - riskPenalty;
      
      if (score > bestScore) {
        bestScore = score;
        bestParams = { P_a, P_b, h };
      }
    }
  }
  
  // Fine-tune with gradient descent
  const { P_a, P_b, h } = bestParams;
  const finalReturn = simulateV3Return(P_0, P_a, P_b, h, volatility, days, V_initial, poolParams, feeTier);
  
  return {
    ...bestParams,
    expectedReturn: finalReturn,
    score: bestScore,
  };
}

/**
 * Simulate V3 return for given parameters
 */
function simulateV3Return(
  P_0: number,
  P_a: number,
  P_b: number,
  h: number,
  volatility: number,
  days: number,
  V_initial: number,
  poolParams: DexExogenousParams,
  feeTier: number = DEFAULT_V3_FEE_TIER
): number {
  // Simple Monte Carlo with 100 scenarios
  let totalReturn = 0;
  const numSims = 100;
  
  for (let i = 0; i < numSims; i++) {
    // Generate final price using log-normal
    const Z = boxMullerTransform();
    const logReturn = volatility * Math.sqrt(days) * Z;
    const P_final = P_0 * Math.exp(logReturn);
    
    // Calculate IL
    const ilResult = calculateV3ImpermanentLoss(P_0, P_final, P_a, P_b);
    
    // Calculate fees (only earned when in range)
    const inRange = P_final >= P_a && P_final <= P_b;
    const efficiency = calculateCapitalEfficiency(P_a, P_b);
    const feesMultiplier = inRange ? 1 : 0; // Fees only when in range, efficiency affects share not volume
    
    // Capital efficiency increases effective share of liquidity, not the volume
    const effectiveLiquidity = V_initial * efficiency;
    const feeAPY = (poolParams.V_24h * feeTier) / (poolParams.TVL_lp + effectiveLiquidity);
    const dailyFeeReturn = feeAPY / 365;
    
    // Calculate compounding with harvest frequency h days
    const harvestPeriods = Math.floor(days / h);
    const compoundedReturn = Math.pow(1 + dailyFeeReturn * h, harvestPeriods) - 1;
    
    // Calculate final value: first calculate HODL value, then apply IL factor
    const priceRatio = P_final / P_0;
    const V_hold = (V_initial / 2) * (priceRatio + 1);
    const V_final = V_hold * ilResult.factor * (1 + compoundedReturn * feesMultiplier);
    totalReturn += V_final;
  }
  
  return totalReturn / numSims - V_initial;
}

/**
 * Box-Muller transform for generating standard normal random variables
 */
function boxMullerTransform(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Standard normal CDF (cumulative distribution function)
 */
function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - prob : prob;
}

/**
 * Estimate log return parameters from historical price ratios (MLE)
 */
export function estimateLogReturnParameters(priceRatios: number[]): {
  mu: number;
  sigma: number;
  annualizedMu: number;
  annualizedSigma: number;
  sampleSize: number;
} {
  if (!priceRatios || priceRatios.length < 2) {
    throw new Error('Need at least 2 price points to estimate parameters');
  }

  // Calculate log returns
  const logReturns: number[] = [];
  for (let i = 1; i < priceRatios.length; i++) {
    const logReturn = Math.log(priceRatios[i] / priceRatios[i - 1]);
    logReturns.push(logReturn);
  }

  // Calculate mean (mu)
  const mu = logReturns.reduce((sum, r) => sum + r, 0) / logReturns.length;

  // Calculate variance and standard deviation (sigma)
  const variance = logReturns.reduce((sum, r) => sum + Math.pow(r - mu, 2), 0) / logReturns.length;
  const sigma = Math.sqrt(variance);

  // Annualize (assuming daily data)
  const annualizedMu = mu * 365;
  const annualizedSigma = sigma * Math.sqrt(365);

  return {
    mu,
    sigma,
    annualizedMu,
    annualizedSigma,
    sampleSize: logReturns.length,
  };
}

/**
 * Monte Carlo simulation for V3 position
 * 
 * Runs N simulations to estimate:
 * - Expected final value
 * - Risk (standard deviation)
 * - Probability distribution
 * - Optimal parameters (P_a, P_b, h)
 */
export function monteCarloSimulationV3(
  userInputs: {
    V_initial: number;
    days: number;
    P_0: number;
  },
  poolParams: DexExogenousParams,
  distributionParams: { mu: number; sigma: number },
  numSimulations: number = 1000,
  optimizeParams: boolean = true
): MonteCarloResultV3 {
  const { V_initial, days, P_0 } = userInputs;
  const { mu, sigma } = distributionParams;
  
  // Optimize parameters if requested
  let P_a: number, P_b: number, h: number;
  
  if (optimizeParams) {
    const optimized = optimizeV3Parameters(P_0, sigma, days, V_initial, poolParams);
    P_a = optimized.P_a;
    P_b = optimized.P_b;
    h = optimized.h;
  } else {
    // Default: 20% range, 50% hedge
    P_a = P_0 * 0.9;
    P_b = P_0 * 1.1;
    h = 0.5;
  }
  
  const efficiency = calculateCapitalEfficiency(P_a, P_b);
  // Capital efficiency increases effective liquidity share, not the volume
  const effectiveLiquidity = V_initial * efficiency;
  const feeAPY = (poolParams.V_24h * DEFAULT_V3_FEE_TIER) / (poolParams.TVL_lp + effectiveLiquidity);
  const dailyFeeReturn = feeAPY / 365;
  
  // Run simulations
  const results: number[] = [];
  
  for (let i = 0; i < numSimulations; i++) {
    // Generate random price ratio using log-normal distribution
    const Z = boxMullerTransform();
    const logReturn = days * mu + Math.sqrt(days) * sigma * Z;
    const r = Math.exp(logReturn);
    const P_final = P_0 * r;
    
    // Check if price is in range
    const inRange = P_final >= P_a && P_final <= P_b;
    
    // Calculate IL
    const ilResult = calculateV3ImpermanentLoss(P_0, P_final, P_a, P_b);
    
    // Calculate fees (only when in range)
    const feesMultiplier = inRange ? 1 : 0;
    const totalFeeReturn = dailyFeeReturn * days * feesMultiplier;
    
    // Calculate farming rewards (similar to V2)
    const farmingAPY = poolParams.TVL_stack > 0
      ? (PANCAKESWAP_V3_FEE_TIERS['0.25'] * 5292500 * poolParams.w_pair_ratio * poolParams.P_cake) /
        (poolParams.TVL_stack + V_initial)
      : 0;
    const dailyFarmingReturn = farmingAPY / 365;
    
    // Calculate compounding with harvest frequency h days
    const harvestPeriods = Math.floor(days / h);
    const periodFeeReturn = dailyFeeReturn * h * feesMultiplier;
    const periodFarmingReturn = dailyFarmingReturn * h;
    const compoundedReturn = Math.pow(1 + periodFeeReturn + periodFarmingReturn, harvestPeriods) - 1;
    
    // Gas costs
    const harvestCount = harvestPeriods + 1; // +1 for initial deposit
    const gasCostPerTx = (DEFAULT_GAS_PER_TX * poolParams.P_gas * poolParams.P_BNB) / 1e9;
    const totalGasCost = gasCostPerTx * harvestCount;
    
    // Final value: calculate HODL value first, then apply IL factor
    const priceRatio = P_final / P_0;
    const V_hold = (V_initial / 2) * (priceRatio + 1);
    const V_final = V_hold * ilResult.factor * (1 + compoundedReturn) - totalGasCost;
    results.push(V_final);
  }
  
  // Statistical analysis
  results.sort((a, b) => a - b);
  
  const meanVFinal = results.reduce((sum, v) => sum + v, 0) / results.length;
  const medianVFinal = results[Math.floor(results.length / 2)];
  const variance = results.reduce((sum, v) => sum + Math.pow(v - meanVFinal, 2), 0) / results.length;
  const stdDevVFinal = Math.sqrt(variance);
  
  const returns = results.map(v => v - V_initial);
  const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const stdDevReturn = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length);
  
  const percentile5 = results[Math.floor(results.length * 0.05)];
  const percentile25 = results[Math.floor(results.length * 0.25)];
  const percentile75 = results[Math.floor(results.length * 0.75)];
  const percentile95 = results[Math.floor(results.length * 0.95)];
  
  const lossCount = results.filter(v => v < V_initial).length;
  const probabilityOfLoss = lossCount / results.length;
  
  const valueAtRisk5 = V_initial - percentile5;
  
  return {
    meanVFinal,
    medianVFinal,
    stdDevVFinal,
    varianceVFinal: variance,
    meanReturn,
    stdDevReturn,
    meanReturnPercent: (meanReturn / V_initial) * 100,
    percentile5,
    percentile25,
    percentile75,
    percentile95,
    probabilityOfLoss,
    valueAtRisk5,
    numSimulations,
    distributionParams: { mu, sigma },
    optimalParameters: { P_a, P_b, h },
    simulations: results,
  };
}

/**
 * Analyze V3 LP position
 */
/**
 * Analyze V3 LP position with specified or optimized parameters
 */
export async function analyzeV3Position(
  pool: PoolData,
  V_initial: number,
  config: V3AnalysisConfig
): Promise<LPV3Analysis> {
  const { days, P_0, P_a: userP_a, P_b: userP_b, h: userH, feeTier, optimizeRange, volatility } = config;
  const poolParams = pool.exogenousParams;
  
  if (!poolParams) {
    throw new Error('Pool missing exogenous parameters');
  }
  
  // Use provided fee tier or default to 0.25%
  const poolFeeTier = feeTier !== undefined ? feeTier : DEFAULT_V3_FEE_TIER;
  
  // Use provided parameters or optimize
  let P_a: number, P_b: number, h: number;
  
  if (optimizeRange && volatility) {
    // Optimize parameters
    const optimized = optimizeV3Parameters(P_0, volatility, days, V_initial, poolParams, poolFeeTier);
    P_a = optimized.P_a;
    P_b = optimized.P_b;
    h = optimized.h;
  } else if (userP_a && userP_b && userH) {
    // Use user-provided parameters
    P_a = userP_a;
    P_b = userP_b;
    h = userH;
  } else {
    throw new Error('Must provide either (P_a, P_b, h) or enable optimizeRange with volatility');
  }
  
  // Estimate distribution parameters
  const sigma = volatility || 0.02;
  const mu = 0.0001; // Small positive drift
  
  // Run Monte Carlo simulation
  const results: number[] = [];
  const numSimulations = 1000;
  
  const efficiency = calculateCapitalEfficiency(P_a, P_b);
  // Capital efficiency increases effective liquidity share, not the volume
  const effectiveLiquidity = V_initial * efficiency;
  const feeAPY = (poolParams.V_24h * poolFeeTier) / (poolParams.TVL_lp + effectiveLiquidity);
  const farmingAPY = poolParams.TVL_stack > 0
    ? (poolFeeTier * 5292500 * poolParams.w_pair_ratio * poolParams.P_cake) /
      (poolParams.TVL_stack + V_initial)
    : 0;
  
  const dailyFeeReturn = feeAPY / 365;
  const dailyFarmingReturn = farmingAPY / 365;
  
  for (let i = 0; i < numSimulations; i++) {
    // Generate random price using log-normal distribution
    const Z = boxMullerTransform();
    const logReturn = days * mu + Math.sqrt(days) * sigma * Z;
    const P_final = P_0 * Math.exp(logReturn);
    
    // Check if price is in range
    const inRange = P_final >= P_a && P_final <= P_b;
    
    // Calculate IL
    const ilResult = calculateV3ImpermanentLoss(P_0, P_final, P_a, P_b);
    
    // Calculate fees (only when in range)
    const feesMultiplier = inRange ? 1 : 0;
    
    // Calculate compounding with harvest frequency h days
    const harvestPeriods = Math.floor(days  / h);
    const periodFeeReturn = dailyFeeReturn * h * feesMultiplier;
    const periodFarmingReturn = dailyFarmingReturn * h;
    const compoundedReturn = Math.pow(1 + periodFeeReturn + periodFarmingReturn, harvestPeriods) - 1;
    
    // Gas costs
    const harvestCount = harvestPeriods + 1;
    const gasCostPerTx = (DEFAULT_GAS_PER_TX * poolParams.P_gas * poolParams.P_BNB) / 1e9;
    const totalGasCost = gasCostPerTx * harvestCount;
    
    // Final value: calculate HODL value first, then apply IL factor
    const priceRatio = P_final / P_0;
    const V_hold = (V_initial / 2) * (priceRatio + 1);
    const V_final = V_hold * ilResult.factor * (1 + compoundedReturn) - totalGasCost;
    results.push(V_final);
  }
  
  // Statistical analysis
  results.sort((a, b) => a - b);
  
  const meanVFinal = results.reduce((sum, v) => sum + v, 0) / results.length;
  const medianVFinal = results[Math.floor(results.length / 2)];
  const returns = results.map(v => v - V_initial);
  const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const stdDevReturn = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length);
  
  const probabilityOfLoss = results.filter(v => v < V_initial).length / results.length;
  
  // Calculate current IL
  const ilResult = calculateV3ImpermanentLoss(P_0, P_0, P_a, P_b);
  
  // Estimate time in range
  const priceStdDev = sigma * Math.sqrt(days);
  const upperBreachProb = 1 - normalCDF((Math.log(P_b / P_0)) / priceStdDev);
  const lowerBreachProb = normalCDF((Math.log(P_a / P_0)) / priceStdDev);
  const timeInRange = (1 - upperBreachProb - lowerBreachProb) * 100;
  
  // Risk assessment
  let riskScore = 75;
  const warnings: string[] = [];
  
  if (timeInRange < 50) {
    riskScore -= 20;
    warnings.push('Low probability of staying in range (< 50%)');
  }
  if (sigma > 0.05) {
    riskScore -= 15;
    warnings.push('High volatility (> 5% daily) increases out-of-range risk');
  }
  if (efficiency > 5) {
    warnings.push('Very concentrated position - high capital efficiency but high risk');
  }
  if (probabilityOfLoss > 0.3) {
    riskScore -= 10;
    warnings.push('High probability of loss (> 30%)');
  }
  
  const riskLevel = riskScore >= 70 ? 'low' : riskScore >= 50 ? 'medium' : riskScore >= 30 ? 'high' : 'critical';
  
  const concentrationRisk = efficiency < 2 ? 'Low (wide range)' 
    : efficiency < 4 ? 'Moderate' 
    : efficiency < 6 ? 'High (concentrated)' 
    : 'Very High (very concentrated)';
  
  return {
    expectedValue: meanVFinal,
    totalReturn: meanReturn,
    totalReturnPercent: (meanReturn / V_initial) * 100,
    annualizedAPY: ((meanReturn / V_initial) * 100 / days) * 365,
    impermanentLoss: ilResult.lossPercent,
    tradingFeeAPY: feeAPY * 100,
    farmingRewardAPY: farmingAPY * 100,
    totalGasCost: (DEFAULT_GAS_PER_TX * poolParams.P_gas * poolParams.P_BNB / 1e9) * (Math.floor(days / h) + 1),
    capitalEfficiency: efficiency,
    timeInRange,
    feesEarned: meanReturn > 0 ? meanReturn * (feeAPY / (feeAPY + farmingAPY)) : 0,
    optimalPriceRange: {
      P_a,
      P_b,
      h,
      rangeWidth: (P_b - P_a) / P_0,
    },
    riskScore,
    riskLevel,
    warnings,
    concentrationRisk,
    volumeToTVLRatio: poolParams.V_24h / poolParams.TVL_lp,
    currentPrice: P_0,
    priceVolatility: sigma,
  };
}
