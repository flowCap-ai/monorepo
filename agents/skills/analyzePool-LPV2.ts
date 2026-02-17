/**
 * analyzePool-LPV2.ts - Mathematical analysis for Uniswap V2 style liquidity pools
 * 
 * Implements comprehensive yield modeling for V2 LP positions including:
 * - Impermanent Loss (IL)
 * - Trading fees from volume
 * - Farming rewards (e.g., CAKE emissions)
 * - Compounding effects
 * - Gas costs for harvest operations
 * 
 * Based on the formula:
 * V_hold = (V_initial / 2) · (r + 1)           // valeur si HODL
 * V_pool = V_hold · IL_factor                  // valeur pool après IL
 * V_final = V_pool · (1 + APY)^n - gas_costs   // valeur finale avec rendements
 * 
 * Where:
 * - r = price_ratio = P_final / P_initial
 * - IL_factor = (2√r) / (1+r)
 * - fee_APY = (V_24h · fee_tier) / (TVL_lp + V_initial)
 * - farming_APY = (annual_emissions · w_pair_ratio · P_reward) / (TVL_staked + V_initial)
 * - gas_costs = open_gas + harvest_gas + close_gas
 *   - open_gas = 550000 · P_gas · 10^-9 · P_BNB
 *   - harvest_gas = gas_per_tx · P_gas · 10^-9 · P_BNB · ⌈days/h⌉
 *   - close_gas = 550000 · P_gas · 10^-9 · P_BNB
 */

import type { Address } from 'viem';
import type { DexExogenousParams, PoolData } from './getPoolData.js';

/**
 * V2 LP position analysis result
 */
export interface LPV2Analysis {
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
  
  // Optimal strategy
  optimalHarvestFrequency: number; // Optimal hours between harvests
  breakEvenDays: number;           // Days to break even on gas costs
  
  // Risk assessment
  riskScore: number;               // 0-100, higher is safer
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  warnings: string[];
  
  // Market conditions
  volumeToTVLRatio: number;        // Daily volume / TVL
  utilizationRate: number;         // How efficiently capital is used
  
  // Sensitivity analysis
  priceChangeImpact: {
    noChange: number;              // Return if price stays same
    up10: number;                  // Return if price +10%
    down10: number;                // Return if price -10%
    up25: number;                  // Return if price +25%
    down25: number;                // Return if price -25%
  };
}

/**
 * Configuration for analysis
 */
export interface AnalysisConfig {
  days: number;                    // Holding period in days
  harvestFrequencyHours: number;   // How often to compound (in hours)
  priceChangeRatio?: number;       // Expected price ratio (default: 1.0, no change)
  gasPerTransaction?: number;      // Gas units per harvest tx (default: 730)
  includeIL?: boolean;             // Include IL calculation (default: true)
}

// Constants for PancakeSwap V2
const PANCAKESWAP_V2_FEE_TIER = 0.0017;      // 0.17% trading fee (0.15% to LPs, 0.02% to treasury)
const PANCAKESWAP_DAILY_EMISSIONS = 14_500;  // Daily CAKE emissions for farms
const PANCAKESWAP_ANNUAL_EMISSIONS = PANCAKESWAP_DAILY_EMISSIONS * 365; // 5,292,500 CAKE/year
const DEFAULT_GAS_PER_TX = 730;              // Average gas cost in Gwei for harvest operation
const DEFAULT_HARVEST_FREQ_HOURS = 24;       // Default: daily compounding
const DEFAULT_HOLDING_DAYS = 30;             // Default: 30-day analysis period

/**
 * Calculate impermanent loss factor
 * 
 * Formula: IL_factor = (2√r) / (1+r)
 * Where r = price_ratio = P_final / P_initial
 * 
 * Examples:
 * - r = 1.0 (no price change): IL_factor = 1.0 (0% IL)
 * - r = 2.0 (price doubles): IL_factor = 0.9428 (-5.72% IL)
 * - r = 0.5 (price halves): IL_factor = 0.9428 (-5.72% IL)
 * - r = 4.0 (price 4x): IL_factor = 0.8 (-20% IL)
 */
export function calculateImpermanentLoss(priceRatio: number): {
  factor: number;
  lossPercent: number;
} {
  const IL_factor = (2 * Math.sqrt(priceRatio)) / (1 + priceRatio);
  const lossPercent = (IL_factor - 1) * 100;
  
  return {
    factor: IL_factor,
    lossPercent: lossPercent,
  };
}

/**
 * Calculate trading fee APY
 * 
 * Formula: fee_APY = (V_24h · fee_tier) / (TVL_lp + V_initial)
 * 
 * This represents the annual yield from trading fees, where:
 * - V_24h is the 24-hour trading volume
 * - fee_tier is the percentage fee (0.17% for PancakeSwap V2)
 * - TVL_lp is the total liquidity in the pool
 * - V_initial is the user's investment (affects their share of fees)
 */
export function calculateTradingFeeAPY(
  volume24h: number,
  tvlLp: number,
  userInvestment: number,
  feeTier: number = PANCAKESWAP_V2_FEE_TIER
): number {
  // Daily fee generation
  const dailyFees = volume24h * feeTier;
  
  // User's effective TVL (pool TVL + their investment)
  const effectiveTVL = tvlLp + userInvestment;
  
  // Daily yield rate
  const dailyYieldRate = dailyFees / effectiveTVL;
  
  // Annualized (365 days)
  const annualAPY = dailyYieldRate * 365 * 100;
  
  return annualAPY;
}

/**
 * Calculate farming reward APY
 * 
 * Formula: farming_APY = (annual_emissions · w_pair_ratio · P_reward) / (TVL_staked + V_initial)
 * 
 * Where:
 * - annual_emissions is the total annual reward token emissions (5,292,500 CAKE = 14,500/day × 365)
 * - w_pair_ratio is the weight of this pool (its share of total emissions)
 * - P_reward is the price of the reward token (e.g., CAKE price in USD)
 * - TVL_staked is the total value staked in farms
 */
export function calculateFarmingAPY(
  annualEmissions: number,
  pairWeightRatio: number,
  rewardTokenPrice: number,
  tvlStaked: number,
  userInvestment: number
): number {
  // Annual USD value of rewards for this pool
  const poolAnnualRewardsUSD = annualEmissions * pairWeightRatio * rewardTokenPrice;
  
  // User's effective staked TVL
  const effectiveStakedTVL = tvlStaked + userInvestment;
  
  // APY as percentage
  const farmingAPY = (poolAnnualRewardsUSD / effectiveStakedTVL) * 100;
  
  return farmingAPY;
}

/**
 * Calculate gas costs for LP operations (open, harvest, close)
 * 
 * Formula: gas_cost = open_gas + harvest_gas + close_gas
 * 
 * Where:
 * - open_gas = 550000 · P_gas · 10^-9 · P_BNB (opening position)
 * - harvest_gas = gas_per_tx · P_gas · 10^-9 · P_BNB · ⌈days/h⌉ (harvest operations)
 * - close_gas = 550000 · P_gas · 10^-9 · P_BNB (closing position)
 * 
 * Parameters:
 * - gas_per_tx: gas units per harvest transaction (e.g., 730)
 * - P_gas: gas price in Gwei
 * - P_BNB: price of BNB in USD
 * - days: investment period
 * - harvestFrequencyHours: hours between harvests
 */
export function calculateGasCosts(
  days: number,
  harvestFrequencyHours: number,
  gasPerTx: number,
  gasPriceGwei: number,
  nativeTokenPrice: number
): number {
  // Gas cost for opening position (550,000 gas units)
  const openGasCostBNB = (550000 * gasPriceGwei) / 1e9;
  const openGasCostUSD = openGasCostBNB * nativeTokenPrice;
  
  // Gas cost for closing position (550,000 gas units)
  const closeGasCostBNB = (550000 * gasPriceGwei) / 1e9;
  const closeGasCostUSD = closeGasCostBNB * nativeTokenPrice;
  
  // Number of harvest transactions
  const numHarvestTransactions = Math.ceil(days * 24 / harvestFrequencyHours);
  
  // Gas cost per harvest transaction in BNB
  const harvestGasCostPerTxBNB = (gasPerTx * gasPriceGwei) / 1e9;
  
  // Total harvest gas costs in USD
  const totalHarvestGasCostUSD = harvestGasCostPerTxBNB * nativeTokenPrice * numHarvestTransactions;
  
  // Total gas cost = open + harvest + close
  const totalGasCostUSD = openGasCostUSD + totalHarvestGasCostUSD + closeGasCostUSD;
  
  return totalGasCostUSD;
}

/**
 * Calculate final value with compounding
 * 
 * Formula:
 * V_hold = (V_initial / 2) · (r + 1)           // valeur si HODL
 * V_pool = V_hold · IL_factor                  // valeur pool après IL
 * V_final = V_pool · (1 + APY)^n - gas_costs   // valeur finale avec rendements
 * 
 * This is the core formula that combines all components:
 * 1. Calculate HODL value
 * 2. Apply impermanent loss factor
 * 3. Apply compounded yield (fees + farming rewards)
 * 4. Subtract gas costs
 */
export function calculateFinalValue(
  initialInvestment: number,
  priceRatio: number,
  impermanentLossFactor: number,
  totalAPY: number,
  days: number,
  harvestFrequencyHours: number,
  gasCosts: number
): number {
  // Convert APY (annual %) to rate per harvest period
  // APY is annual, so divide by 365 days, then multiply by harvest frequency in days
  const harvestFrequencyDays = harvestFrequencyHours / 24;
  const ratePerHarvest = (totalAPY / 100 / 365) * harvestFrequencyDays;
  
  // Number of compounding periods
  const numPeriods = days / harvestFrequencyDays;
  
  // Step 1: Calculate HODL value (value if you just held the tokens)
  const V_hold = (initialInvestment / 2) * (priceRatio + 1);
  
  // Step 2: Apply impermanent loss to get pool value
  const V_pool = V_hold * impermanentLossFactor;
  
  // Step 3: Apply compound interest formula: A = P(1 + r)^n
  const valueBeforeGas = V_pool * Math.pow(1 + ratePerHarvest, numPeriods);
  
  // Step 4: Subtract gas costs
  const finalValue = valueBeforeGas - gasCosts;
  
  return finalValue;
}

/**
 * Calculate optimal harvest frequency to maximize net returns
 * 
 * This finds the harvest frequency that maximizes (yield - gas_costs)
 * Generally, higher APY justifies more frequent compounding, but gas costs limit this
 */
export function calculateOptimalHarvestFrequency(
  initialInvestment: number,
  totalAPY: number,
  days: number,
  gasPerTx: number,
  gasPriceGwei: number,
  nativeTokenPrice: number,
  priceRatio: number,
  impermanentLossFactor: number = 1.0
): number {
  // Test different harvest frequencies (in hours)
  const testFrequencies = [1, 2, 4, 6, 8, 12, 24, 48, 72, 168]; // 1hr to 1 week
  
  let bestFrequency = 24; // Default: daily
  let bestNetReturn = -Infinity;
  
  for (const freq of testFrequencies) {
    const gasCosts = calculateGasCosts(days, freq, gasPerTx, gasPriceGwei, nativeTokenPrice);
    const finalValue = calculateFinalValue(
      initialInvestment,
      priceRatio,
      impermanentLossFactor,
      totalAPY,
      days,
      freq,
      gasCosts
    );
    const netReturn = finalValue - initialInvestment;
    
    if (netReturn > bestNetReturn) {
      bestNetReturn = netReturn;
      bestFrequency = freq;
    }
  }
  
  return bestFrequency;
}

/**
 * Calculate break-even period for gas costs
 * 
 * Returns the minimum number of days needed for yield to cover gas costs
 */
export function calculateBreakEvenDays(
  initialInvestment: number,
  totalAPY: number,
  harvestFrequencyHours: number,
  gasPerTx: number,
  gasPriceGwei: number,
  nativeTokenPrice: number
): number {
  // Daily yield in USD (approximate, without compounding)
  const dailyYield = initialInvestment * (totalAPY / 100 / 365);
  
  // Gas cost per harvest
  const gasCostPerHarvest = (gasPerTx * gasPriceGwei / 1e9) * nativeTokenPrice;
  
  // Days to recover one harvest cost
  const daysPerHarvest = harvestFrequencyHours / 24;
  const harvestsNeeded = 1; // Break even on at least one harvest
  
  if (dailyYield === 0) return Infinity;
  
  const breakEvenDays = (gasCostPerHarvest * harvestsNeeded) / dailyYield;
  
  return Math.max(daysPerHarvest, breakEvenDays);
}

/**
 * Calculate risk score based on pool metrics
 */
export function calculateRiskScore(
  tvlLp: number,
  volume24h: number,
  tvlStaked: number,
  assets: string[]
): { score: number; level: 'low' | 'medium' | 'high' | 'critical'; warnings: string[] } {
  const warnings: string[] = [];
  let score = 100;
  
  // TVL risk
  if (tvlLp < 100_000) {
    score -= 40;
    warnings.push('Very low TVL - high risk of rug pull or abandonment');
  } else if (tvlLp < 1_000_000) {
    score -= 20;
    warnings.push('Low TVL - potential liquidity risk');
  } else if (tvlLp < 10_000_000) {
    score -= 5;
  }
  
  // Volume/TVL ratio (indicates pool efficiency)
  const volumeToTVLRatio = volume24h / tvlLp;
  if (volumeToTVLRatio < 0.01) {
    score -= 15;
    warnings.push('Very low trading activity - inefficient capital usage');
  } else if (volumeToTVLRatio > 2.0) {
    score -= 10;
    warnings.push('Extremely high volume/TVL ratio - potential volatility');
  }
  
  // Stablecoin pairs are lower risk
  const stablecoins = ['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'USDD'];
  const isStablePair = assets.every(asset => stablecoins.includes(asset.toUpperCase()));
  const hasOneStable = assets.some(asset => stablecoins.includes(asset.toUpperCase()));
  
  if (isStablePair) {
    score += 15; // Bonus for stable pairs
  } else if (!hasOneStable) {
    score -= 10; // Penalty for volatile pairs
    warnings.push('No stablecoins in pair - higher impermanent loss risk');
  }
  
  // Staking TVL vs LP TVL
  if (tvlStaked < tvlLp * 0.1) {
    score -= 10;
    warnings.push('Low farming participation - rewards may not be attractive');
  }
  
  // Determine risk level
  let level: 'low' | 'medium' | 'high' | 'critical';
  if (score >= 80) level = 'low';
  else if (score >= 60) level = 'medium';
  else if (score >= 40) level = 'high';
  else level = 'critical';
  
  return { score: Math.max(0, Math.min(100, score)), level, warnings };
}

/**
 * Perform sensitivity analysis for different price change scenarios
 */
export function performSensitivityAnalysis(
  params: DexExogenousParams,
  config: AnalysisConfig
): LPV2Analysis['priceChangeImpact'] {
  const priceRatios = {
    noChange: 1.0,
    up10: 1.1,
    down10: 0.9,
    up25: 1.25,
    down25: 0.75,
  };
  
  const results: any = {};
  
  for (const [scenario, ratio] of Object.entries(priceRatios)) {
    const il = calculateImpermanentLoss(ratio);
    const feeAPY = calculateTradingFeeAPY(params.V_24h, params.TVL_lp, params.V_initial);
    const farmingAPY = calculateFarmingAPY(
      PANCAKESWAP_ANNUAL_EMISSIONS,
      params.w_pair_ratio,
      params.P_cake,
      params.TVL_stack,
      params.V_initial
    );
    const totalAPY = feeAPY + farmingAPY;
    const gasCosts = calculateGasCosts(
      config.days,
      config.harvestFrequencyHours,
      config.gasPerTransaction || DEFAULT_GAS_PER_TX,
      params.P_gas,
      params.P_BNB
    );
    const finalValue = calculateFinalValue(
      params.V_initial,
      ratio,
      il.factor,
      totalAPY,
      config.days,
      config.harvestFrequencyHours,
      gasCosts
    );
    
    results[scenario] = ((finalValue - params.V_initial) / params.V_initial) * 100;
  }
  
  return results;
}

/**
 * Main analysis function for V2 LP positions
 * 
 * @param poolData - Pool information with exogenous parameters
 * @param config - Analysis configuration (holding period, harvest frequency, etc.)
 * @returns Comprehensive analysis of the LP position
 */
export async function analyzeLPV2Position(
  poolData: PoolData,
  config: Partial<AnalysisConfig> = {}
): Promise<LPV2Analysis> {
  // Validate input
  if (!poolData.exogenousParams) {
    throw new Error('Pool data must include exogenous parameters for V2 LP analysis');
  }
  
  if (poolData.protocol !== 'pancakeswap' || poolData.type !== 'lp-farm') {
    throw new Error('This analysis is designed for PancakeSwap V2 LP farms');
  }
  
  const params = poolData.exogenousParams;
  
  // Apply default configuration
  const analysisConfig: AnalysisConfig = {
    days: config.days ?? DEFAULT_HOLDING_DAYS,
    harvestFrequencyHours: config.harvestFrequencyHours ?? DEFAULT_HARVEST_FREQ_HOURS,
    priceChangeRatio: config.priceChangeRatio ?? 1.0,
    gasPerTransaction: config.gasPerTransaction ?? DEFAULT_GAS_PER_TX,
    includeIL: config.includeIL !== undefined ? config.includeIL : true,
  };
  
  // Calculate impermanent loss
  const il = calculateImpermanentLoss(analysisConfig.priceChangeRatio!);
  const ilFactor = analysisConfig.includeIL ? il.factor : 1.0;
  
  // Calculate APY components
  const tradingFeeAPY = calculateTradingFeeAPY(
    params.V_24h,
    params.TVL_lp,
    params.V_initial
  );
  
  const farmingRewardAPY = calculateFarmingAPY(
    PANCAKESWAP_ANNUAL_EMISSIONS,
    params.w_pair_ratio,
    params.P_cake,
    params.TVL_stack,
    params.V_initial
  );
  
  const totalAPY = tradingFeeAPY + farmingRewardAPY;
  
  // Calculate gas costs
  const totalGasCost = calculateGasCosts(
    analysisConfig.days,
    analysisConfig.harvestFrequencyHours,
    analysisConfig.gasPerTransaction!,
    params.P_gas,
    params.P_BNB
  );
  
  // Calculate final value
  const expectedValue = calculateFinalValue(
    params.V_initial,
    analysisConfig.priceChangeRatio!,
    ilFactor,
    totalAPY,
    analysisConfig.days,
    analysisConfig.harvestFrequencyHours,
    totalGasCost
  );
  
  // Calculate returns
  const totalReturn = expectedValue - params.V_initial;
  const totalReturnPercent = (totalReturn / params.V_initial) * 100;
  const annualizedAPY = (totalReturnPercent / analysisConfig.days) * 365;
  
  // Calculate optimal strategy
  const optimalHarvestFrequency = calculateOptimalHarvestFrequency(
    params.V_initial,
    totalAPY,
    analysisConfig.days,
    analysisConfig.gasPerTransaction!,
    params.P_gas,
    params.P_BNB,
    analysisConfig.priceChangeRatio!,
    ilFactor
  );
  
  const breakEvenDays = calculateBreakEvenDays(
    params.V_initial,
    totalAPY,
    analysisConfig.harvestFrequencyHours,
    analysisConfig.gasPerTransaction!,
    params.P_gas,
    params.P_BNB
  );
  
  // Calculate risk score
  const riskAssessment = calculateRiskScore(
    params.TVL_lp,
    params.V_24h,
    params.TVL_stack,
    poolData.assets
  );
  
  // Market conditions
  const volumeToTVLRatio = params.V_24h / params.TVL_lp;
  const utilizationRate = params.TVL_stack / params.TVL_lp; // How much of LP is actively farmed
  
  // Sensitivity analysis
  const priceChangeImpact = performSensitivityAnalysis(params, analysisConfig);
  
  // Add warnings based on analysis
  if (totalGasCost > totalReturn && totalReturn > 0) {
    riskAssessment.warnings.push('Gas costs consume significant portion of returns - consider longer holding period');
  }
  
  if (totalReturn < 0) {
    riskAssessment.warnings.push('Expected negative returns - position not profitable under current conditions');
  }
  
  if (breakEvenDays > analysisConfig.days) {
    riskAssessment.warnings.push(`Break-even period (${breakEvenDays.toFixed(1)} days) exceeds holding period`);
  }
  
  return {
    // Core metrics
    expectedValue: Math.round(expectedValue * 100) / 100,
    totalReturn: Math.round(totalReturn * 100) / 100,
    totalReturnPercent: Math.round(totalReturnPercent * 100) / 100,
    annualizedAPY: Math.round(annualizedAPY * 100) / 100,
    
    // Components
    impermanentLoss: Math.round(il.lossPercent * 100) / 100,
    tradingFeeAPY: Math.round(tradingFeeAPY * 100) / 100,
    farmingRewardAPY: Math.round(farmingRewardAPY * 100) / 100,
    totalGasCost: Math.round(totalGasCost * 1000) / 1000,
    
    // Strategy
    optimalHarvestFrequency: optimalHarvestFrequency,
    breakEvenDays: Math.round(breakEvenDays * 10) / 10,
    
    // Risk
    riskScore: riskAssessment.score,
    riskLevel: riskAssessment.level,
    warnings: riskAssessment.warnings,
    
    // Market
    volumeToTVLRatio: Math.round(volumeToTVLRatio * 1000) / 1000,
    utilizationRate: Math.round(utilizationRate * 1000) / 1000,
    
    // Sensitivity
    priceChangeImpact: {
      noChange: Math.round(priceChangeImpact.noChange * 100) / 100,
      up10: Math.round(priceChangeImpact.up10 * 100) / 100,
      down10: Math.round(priceChangeImpact.down10 * 100) / 100,
      up25: Math.round(priceChangeImpact.up25 * 100) / 100,
      down25: Math.round(priceChangeImpact.down25 * 100) / 100,
    },
  };
}

/**
 * MAIN FUNCTION: Calculate final value with optimized harvest frequency
 * 
 * This function takes:
 * - User inputs: V_initial, days, r (price ratio)
 * - On-chain data: TVL_lp, V_24h, w_pair_ratio, P_cake, TVL_stack, P_gas, P_BNB
 * 
 * It automatically optimizes h (harvest frequency) and returns V_final
 * 
 * @param userInputs - Values provided by the user
 * @param onChainData - Values retrieved from blockchain
 * @returns Final value (V_final) after the investment period
 */
export function calculateOptimizedFinalValue(
  userInputs: {
    V_initial: number;  // Initial investment in USD
    days: number;       // Investment period in days
    r: number;          // Price ratio (P_final / P_initial)
  },
  onChainData: {
    V_24h: number;          // 24h trading volume (USD)
    TVL_lp: number;         // Pool liquidity (USD)
    w_pair_ratio: number;   // Pool weight (0-1)
    P_cake: number;         // CAKE price (USD)
    TVL_stack: number;      // Staked TVL (USD)
    P_gas: number;          // Gas price (Gwei)
    P_BNB: number;          // BNB price (USD)
  }
): number {
  const { V_initial, days, r } = userInputs;
  const { V_24h, TVL_lp, w_pair_ratio, P_cake, TVL_stack, P_gas, P_BNB } = onChainData;
  
  // ========== VALIDATION ==========
  if (V_initial <= 0) {
    throw new Error('V_initial must be greater than 0');
  }
  
  if (days <= 0) {
    throw new Error('Investment period (days) must be greater than 0');
  }
  
  if (r <= 0) {
    throw new Error('Price ratio (r) must be greater than 0');
  }
  
  if (TVL_lp <= 0) {
    throw new Error('TVL_lp must be greater than 0. A liquidity pool cannot have zero liquidity.');
  }
  
  if (V_24h < 0) {
    throw new Error('V_24h cannot be negative');
  }
  
  // 1. Calculate impermanent loss factor
  const IL_factor = (2 * Math.sqrt(r)) / (1 + r);
  
  // 2. Calculate trading fee APY
  const dailyFees = V_24h * PANCAKESWAP_V2_FEE_TIER;
  const effectiveTVL = TVL_lp + V_initial;
  const dailyYieldRate = dailyFees / effectiveTVL;
  const tradingFeeAPY = dailyYieldRate * 365 * 100;
  
  // 3. Calculate farming reward APY
  let farmingAPY = 0;
  
  // Only calculate farming APY if there's a staking pool (TVL_stack > 0 OR w_pair_ratio > 0)
  if (TVL_stack > 0 || w_pair_ratio > 0) {
    const poolAnnualRewardsUSD = PANCAKESWAP_ANNUAL_EMISSIONS * w_pair_ratio * P_cake;
    const effectiveStakedTVL = TVL_stack + V_initial;
    farmingAPY = (poolAnnualRewardsUSD / effectiveStakedTVL) * 100;
  }
  
  // 4. Total APY
  const totalAPY = tradingFeeAPY + farmingAPY;
  
  // 5. Optimize harvest frequency
  const testFrequencies = [1, 2, 4, 6, 8, 12, 24, 48, 72, 168];
  let bestH = 24;
  let bestVFinal = -Infinity;
  
  for (const h of testFrequencies) {
    // Calculate gas costs for this frequency
    const numTransactions = Math.ceil(days * 24 / h) + 1;
    const gasCostPerTxBNB = (DEFAULT_GAS_PER_TX * P_gas) / 1e9;
    const totalGasCost = gasCostPerTxBNB * P_BNB * numTransactions;
    
    // Calculate final value with this frequency
    const harvestFrequencyDays = h / 24;
    const ratePerHarvest = (totalAPY / 100 / 365) * harvestFrequencyDays;
    const numPeriods = days / harvestFrequencyDays;
    
    // Step 1: Calculate HODL value (value if you just held the tokens)
    const V_hold = (V_initial / 2) * (r + 1);
    
    // Step 2: Apply impermanent loss to get pool value
    const V_pool = V_hold * IL_factor;
    
    // Step 3: Apply compound interest
    const valueBeforeGas = V_pool * Math.pow(1 + ratePerHarvest, numPeriods);
    const V_final = valueBeforeGas - totalGasCost;
    
    if (V_final > bestVFinal) {
      bestVFinal = V_final;
      bestH = h;
    }
  }
  
  return bestVFinal;
}

/**
 * Simplified interface: Optimize harvest frequency and return period performance
 * 
 * This is the main function users should call. It automatically:
 * 1. Finds the optimal harvest frequency (h)
 * 2. Calculates returns for the specified period
 * 3. Accounts for price changes (IL)
 * 4. Returns clear, actionable results
 * 
 * @param poolData - Pool information with exogenous parameters
 * @param days - Investment period in days
 * @param priceRatio - Expected price ratio r = P_final / P_initial (default: 1.0 = no change)
 * @returns Optimized analysis with period return and optimal harvest strategy
 */
export async function optimizeAndAnalyzeLPPosition(
  poolData: PoolData,
  days: number,
  priceRatio: number = 1.0
): Promise<{
  // Input parameters
  investmentPeriodDays: number;
  priceChangeRatio: number;
  initialInvestment: number;
  
  // Optimized strategy
  optimalHarvestFrequencyHours: number;
  numberOfHarvests: number;
  
  // Period returns
  finalValue: number;
  totalReturn: number;
  totalReturnPercent: number;
  annualizedAPY: number;
  
  // Cost breakdown
  impermanentLoss: number;
  tradingFeeIncome: number;
  farmingRewardIncome: number;
  totalGasCost: number;
  netProfit: number;
  
  // APY breakdown
  tradingFeeAPY: number;
  farmingRewardAPY: number;
  totalAPYBeforeIL: number;
  
  // Risk & recommendations
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskScore: number;
  warnings: string[];
  isProfitable: boolean;
  recommendedAction: 'ENTER' | 'CONSIDER' | 'AVOID';
}> {
  // Run full analysis with optimal harvest frequency
  const analysis = await analyzeLPV2Position(poolData, {
    days,
    priceChangeRatio: priceRatio,
    // Let the function find optimal frequency internally
  });
  
  // Extract exogenous params
  const params = poolData.exogenousParams!;
  
  // Calculate income breakdown
  const tradingFeeIncome = (analysis.tradingFeeAPY / 100 / 365) * params.V_initial * days;
  const farmingRewardIncome = (analysis.farmingRewardAPY / 100 / 365) * params.V_initial * days;
  const netProfit = analysis.totalReturn - analysis.totalGasCost;
  
  // Number of harvests with optimal frequency
  const numberOfHarvests = Math.ceil((days * 24) / analysis.optimalHarvestFrequency);
  
  // Determine recommendation
  let recommendedAction: 'ENTER' | 'CONSIDER' | 'AVOID';
  const isProfitable = netProfit > 0;
  
  if (analysis.riskLevel === 'low' && analysis.annualizedAPY > 15 && isProfitable) {
    recommendedAction = 'ENTER';
  } else if (analysis.riskLevel === 'medium' && analysis.annualizedAPY > 10 && isProfitable) {
    recommendedAction = 'CONSIDER';
  } else {
    recommendedAction = 'AVOID';
  }
  
  return {
    // Input
    investmentPeriodDays: days,
    priceChangeRatio: priceRatio,
    initialInvestment: params.V_initial,
    
    // Strategy
    optimalHarvestFrequencyHours: analysis.optimalHarvestFrequency,
    numberOfHarvests,
    
    // Returns
    finalValue: analysis.expectedValue,
    totalReturn: analysis.totalReturn,
    totalReturnPercent: analysis.totalReturnPercent,
    annualizedAPY: analysis.annualizedAPY,
    
    // Breakdown
    impermanentLoss: analysis.impermanentLoss,
    tradingFeeIncome: Math.round(tradingFeeIncome * 100) / 100,
    farmingRewardIncome: Math.round(farmingRewardIncome * 100) / 100,
    totalGasCost: analysis.totalGasCost,
    netProfit: Math.round(netProfit * 100) / 100,
    
    // APY
    tradingFeeAPY: analysis.tradingFeeAPY,
    farmingRewardAPY: analysis.farmingRewardAPY,
    totalAPYBeforeIL: analysis.tradingFeeAPY + analysis.farmingRewardAPY,
    
    // Risk
    riskLevel: analysis.riskLevel,
    riskScore: analysis.riskScore,
    warnings: analysis.warnings,
    isProfitable,
    recommendedAction,
  };
}

/**
 * Batch optimization: Compare multiple scenarios (different periods and price changes)
 * 
 * @param poolData - Pool information
 * @param scenarios - Array of {days, priceRatio} to test
 * @returns Array of optimized analyses for comparison
 */
export async function compareScenarios(
  poolData: PoolData,
  scenarios: Array<{ days: number; priceRatio: number; label?: string }>
): Promise<Array<{
  label: string;
  days: number;
  priceRatio: number;
  annualizedAPY: number;
  totalReturnPercent: number;
  netProfit: number;
  optimalHarvestHours: number;
  recommendedAction: string;
}>> {
  const results = [];
  
  for (const scenario of scenarios) {
    const analysis = await optimizeAndAnalyzeLPPosition(
      poolData,
      scenario.days,
      scenario.priceRatio
    );
    
    results.push({
      label: scenario.label || `${scenario.days}d, r=${scenario.priceRatio}`,
      days: scenario.days,
      priceRatio: scenario.priceRatio,
      annualizedAPY: analysis.annualizedAPY,
      totalReturnPercent: analysis.totalReturnPercent,
      netProfit: analysis.netProfit,
      optimalHarvestHours: analysis.optimalHarvestFrequencyHours,
      recommendedAction: analysis.recommendedAction,
    });
  }
  
  return results;
}

/**
 * ============================================================================
 * MONTE CARLO SIMULATION
 * ============================================================================
 */

/**
 * Estimate log-return distribution parameters from historical prices
 * 
 * Models log(P_{t+1}/P_t) ~ Normal(μ, σ²)
 * 
 * @param prices - Array of historical prices (must be in chronological order)
 * @returns Distribution parameters
 */
export function estimateLogReturnParameters(prices: number[]): {
  mu: number;              // Daily mean log return
  sigma: number;           // Daily std dev of log returns
  annualizedMu: number;    // Annualized drift
  annualizedSigma: number; // Annualized volatility
  sampleSize: number;      // Number of observations
} {
  if (prices.length < 2) {
    throw new Error('Need at least 2 price points to estimate parameters');
  }
  
  // Calculate log returns: log(P_{t+1}/P_t)
  const logReturns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] <= 0 || prices[i-1] <= 0) {
      throw new Error('Prices must be positive');
    }
    logReturns.push(Math.log(prices[i] / prices[i-1]));
  }
  
  // Calculate mean (μ)
  const mu = logReturns.reduce((sum, r) => sum + r, 0) / logReturns.length;
  
  // Calculate standard deviation (σ)
  const squaredDeviations = logReturns.map(r => Math.pow(r - mu, 2));
  const variance = squaredDeviations.reduce((sum, sq) => sum + sq, 0) / logReturns.length;
  const sigma = Math.sqrt(variance);
  
  // Annualize parameters (assuming daily data)
  // Annual μ = daily μ × 365
  // Annual σ = daily σ × √365
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
 * Generate random price ratios from log-normal distribution
 * 
 * If log(r) ~ Normal(μ×days, σ²×days), then r ~ LogNormal
 * 
 * Uses Box-Muller transform for normal random generation
 * 
 * @param mu - Daily mean log return
 * @param sigma - Daily std dev of log returns
 * @param days - Investment period in days
 * @param numSimulations - Number of r values to generate
 * @returns Array of price ratios
 */
export function generatePriceRatios(
  mu: number,
  sigma: number,
  days: number,
  numSimulations: number = 1000
): number[] {
  const priceRatios: number[] = [];
  
  // Adjust parameters for the investment period
  const periodMu = mu * days;
  const periodSigma = sigma * Math.sqrt(days);
  
  // Generate random normal values using Box-Muller transform
  for (let i = 0; i < numSimulations; i++) {
    // Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    
    // Transform to our distribution: log(r) ~ N(periodMu, periodSigma²)
    const logR = periodMu + periodSigma * z;
    
    // r = exp(log(r))
    const r = Math.exp(logR);
    
    priceRatios.push(r);
  }
  
  return priceRatios;
}

/**
 * Monte Carlo simulation result
 */
export interface MonteCarloResult {
  // Summary statistics
  meanVFinal: number;           // Average final value
  medianVFinal: number;         // Median final value
  stdDevVFinal: number;         // Standard deviation
  varianceVFinal: number;       // Variance
  
  // Return statistics
  meanReturn: number;           // Average return ($)
  meanReturnPercent: number;    // Average return (%)
  stdDevReturn: number;         // Std dev of returns
  
  // Risk metrics
  percentile5: number;          // 5th percentile (worst 5% of outcomes)
  percentile25: number;         // 25th percentile
  percentile75: number;         // 75th percentile
  percentile95: number;         // 95th percentile (best 5% of outcomes)
  probabilityOfLoss: number;    // P(V_final < V_initial)
  valueAtRisk5: number;         // VaR at 5% (max loss in worst 5%)
  
  // Distribution info
  numSimulations: number;
  distributionParams: {
    mu: number;
    sigma: number;
    days: number;
  };
  
  // All simulations (optional, for detailed analysis)
  simulations: Array<{
    r: number;
    V_final: number;
    return: number;
    returnPercent: number;
  }>;
}

/**
 * Run Monte Carlo simulation for LP position
 * 
 * Generates 1000 (or specified) scenarios using log-normal distribution
 * of price ratios, calculates V_final for each, and computes statistics
 * 
 * @param userInputs - Initial investment and period
 * @param poolParams - Pool parameters (TVL, volume, etc.)
 * @param distributionParams - μ and σ from historical data
 * @param numSimulations - Number of simulations (default: 1000)
 * @returns Monte Carlo statistics
 */
export function monteCarloSimulation(
  userInputs: {
    V_initial: number;
    days: number;
  },
  poolParams: DexExogenousParams,
  distributionParams: {
    mu: number;      // Daily mean log return
    sigma: number;   // Daily std dev of log returns
  },
  numSimulations: number = 1000
): MonteCarloResult {
  const { V_initial, days } = userInputs;
  const { mu, sigma } = distributionParams;
  
  // Validate inputs
  if (V_initial <= 0) throw new Error('V_initial must be positive');
  if (days <= 0) throw new Error('days must be positive');
  if (numSimulations < 100) throw new Error('Need at least 100 simulations');
  
  // Generate price ratios from log-normal distribution
  const priceRatios = generatePriceRatios(mu, sigma, days, numSimulations);
  
  // Calculate V_final for each scenario
  const simulations = priceRatios.map(r => {
    const V_final = calculateOptimizedFinalValue(
      { V_initial, days, r },
      poolParams
    );
    
    const returnValue = V_final - V_initial;
    const returnPercent = (returnValue / V_initial) * 100;
    
    return {
      r,
      V_final,
      return: returnValue,
      returnPercent,
    };
  });
  
  // Sort simulations by V_final for percentile calculations
  const sortedByVFinal = [...simulations].sort((a, b) => a.V_final - b.V_final);
  
  // Calculate summary statistics
  const vFinalValues = simulations.map(s => s.V_final);
  const meanVFinal = vFinalValues.reduce((sum, v) => sum + v, 0) / numSimulations;
  
  const squaredDeviations = vFinalValues.map(v => Math.pow(v - meanVFinal, 2));
  const varianceVFinal = squaredDeviations.reduce((sum, sq) => sum + sq, 0) / numSimulations;
  const stdDevVFinal = Math.sqrt(varianceVFinal);
  
  const medianVFinal = sortedByVFinal[Math.floor(numSimulations * 0.5)].V_final;
  
  // Return statistics
  const returns = simulations.map(s => s.return);
  const meanReturn = returns.reduce((sum, r) => sum + r, 0) / numSimulations;
  const meanReturnPercent = (meanReturn / V_initial) * 100;
  
  const returnDeviations = returns.map(r => Math.pow(r - meanReturn, 2));
  const varianceReturn = returnDeviations.reduce((sum, sq) => sum + sq, 0) / numSimulations;
  const stdDevReturn = Math.sqrt(varianceReturn);
  
  // Percentiles
  const percentile5 = sortedByVFinal[Math.floor(numSimulations * 0.05)].V_final;
  const percentile25 = sortedByVFinal[Math.floor(numSimulations * 0.25)].V_final;
  const percentile75 = sortedByVFinal[Math.floor(numSimulations * 0.75)].V_final;
  const percentile95 = sortedByVFinal[Math.floor(numSimulations * 0.95)].V_final;
  
  // Risk metrics
  const lossCount = simulations.filter(s => s.V_final < V_initial).length;
  const probabilityOfLoss = lossCount / numSimulations;
  const valueAtRisk5 = V_initial - percentile5; // Max loss in worst 5%
  
  return {
    meanVFinal,
    medianVFinal,
    stdDevVFinal,
    varianceVFinal,
    
    meanReturn,
    meanReturnPercent,
    stdDevReturn,
    
    percentile5,
    percentile25,
    percentile75,
    percentile95,
    probabilityOfLoss,
    valueAtRisk5,
    
    numSimulations,
    distributionParams: { mu, sigma, days },
    
    simulations,
  };
}

/**
 * Estimate distribution parameters from price ratio history
 * 
 * Takes price ratio data (e.g., ETH/BUSD over time) and estimates
 * the log-return distribution parameters
 * 
 * @param priceRatios - Historical price ratios in chronological order
 * @returns Distribution parameters
 */
export function estimateFromPriceRatioHistory(priceRatios: number[]): {
  mu: number;
  sigma: number;
  annualizedMu: number;
  annualizedSigma: number;
  sampleSize: number;
} {
  // Price ratios are just prices of the ratio, so same logic applies
  return estimateLogReturnParameters(priceRatios);
}

/**
 * Export default for OpenClaw tool integration
 */
export default {
  // Main simplified interface
  optimizeAndAnalyzeLPPosition,
  compareScenarios,
  calculateOptimizedFinalValue,  // Minimal interface: returns V_final only
  
  // Full analysis
  analyzeLPV2Position,
  
  // Individual calculations
  calculateImpermanentLoss,
  calculateTradingFeeAPY,
  calculateFarmingAPY,
  calculateGasCosts,
  calculateOptimalHarvestFrequency,
  calculateBreakEvenDays,
  calculateRiskScore,
  
  // Monte Carlo simulation
  monteCarloSimulation,
  estimateLogReturnParameters,
  generatePriceRatios,
  estimateFromPriceRatioHistory,
};
