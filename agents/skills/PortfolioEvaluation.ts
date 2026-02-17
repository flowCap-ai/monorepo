/**
 * PortfolioEvaluation.ts
 * 
 * Portfolio-level analysis combining multiple DeFi positions
 * 
 * Features:
 * - Reads position JSON files (LPV2, LPV3, Lending)
 * - Fetches historical price data for correlation analysis
 * - Constructs asset correlation matrix
 * - Computes portfolio metrics: return, volatility, VaR, Sharpe ratio
 * - Performs diversification analysis
 * 
 * Usage: npx tsx agents/skills/PortfolioEvaluation.ts
 */

import { getPriceRatioTimeSeries, getHistoricalPricesFromCoinGecko } from './getPriceHistory.js';
import * as fs from 'fs';
import * as path from 'path';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface PositionJSON {
  productType: 'LPV2' | 'LPV3' | 'Lending';
  timestamp: string;
  config: {
    pair?: string;
    protocol?: string;
    asset?: string;
    initialInvestment: number;
    periodDays: number;
  };
  analysis: {
    returns: {
      expectedFinalValue: number;
      expectedReturn: number;
      expectedReturnPercent: number;
      annualizedAPY: number;
    };
    distribution?: {
      mean: number;
      median: number | null;
      stdDeviation: number | null;
      percentile5: number | null;
      percentile95: number | null;
    };
    risk?: {
      probabilityOfLoss: number | null;
      sharpeRatio?: number;
    };
  };
  marketConditions?: {
    distributionParams?: {
      mu: number;
      sigma: number;
    };
  };
}

interface PortfolioPosition {
  file: string;
  type: 'LPV2' | 'LPV3' | 'Lending';
  assets: string[];
  allocation: number; // USD invested
  weight: number; // Percentage of portfolio
  expectedReturn: number; // Expected USD return
  returnPercent: number; // Return as percentage
  volatility: number; // Standard deviation
  sharpeRatio: number | null;
}

interface CorrelationMatrix {
  assets: string[];
  matrix: number[][];
}

interface PortfolioMetrics {
  totalInvestment: number;
  expectedFinalValue: number;
  expectedReturn: number;
  expectedReturnPercent: number;
  annualizedAPY: number;
  
  // Risk metrics
  portfolioVolatility: number; // Portfolio standard deviation
  portfolioVariance: number;
  diversificationBenefit: number; // How much correlation reduces risk
  
  // Advanced metrics
  valueAtRisk5: number; // 5% VaR
  valueAtRisk1: number; // 1% VaR
  conditionalVaR5: number; // Expected shortfall at 5%
  sharpeRatio: number;
  sortinoRatio: number;
  
  // Correlation analysis
  avgCorrelation: number;
  correlationMatrix: CorrelationMatrix;
  
  // Position breakdown
  positions: PortfolioPosition[];
}

// ═══════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════

/**
 * Load position JSON files from json_store_positions folder
 */
function loadPositionFiles(filePaths: string[]): PositionJSON[] {
  const positions: PositionJSON[] = [];
  
  for (const filePath of filePaths) {
    try {
      const fullPath = path.isAbsolute(filePath) 
        ? filePath 
        : path.join(process.cwd(), 'agents', 'json_store_positions', filePath);
      
      if (!fs.existsSync(fullPath)) {
        console.warn(`⚠️  File not found: ${filePath}`);
        continue;
      }
      
      const content = fs.readFileSync(fullPath, 'utf-8');
      const position = JSON.parse(content) as PositionJSON;
      positions.push(position);
    } catch (error) {
      console.error(`❌ Error loading ${filePath}:`, error);
    }
  }
  
  return positions;
}

/**
 * Extract unique assets from positions
 */
function extractAssets(positions: PositionJSON[]): string[] {
  const assetSet = new Set<string>();
  
  for (const pos of positions) {
    if (pos.productType === 'Lending' && pos.config.asset) {
      // For lending, only track the supplied asset if non-stablecoin
      const asset = pos.config.asset;
      if (!['USDT', 'USDC', 'BUSD', 'DAI'].includes(asset)) {
        assetSet.add(asset);
      }
    } else if (pos.config.pair) {
      // For LP positions, extract both tokens
      const tokens = pos.config.pair.split('-');
      for (const token of tokens) {
        // Filter out stablecoins for correlation analysis
        if (!['USDT', 'USDC', 'BUSD', 'DAI'].includes(token)) {
          assetSet.add(token);
        }
      }
    }
  }
  
  return Array.from(assetSet);
}

/**
 * Fetch historical prices for all assets and compute returns
 */
async function fetchAssetReturns(
  assets: string[],
  days: number
): Promise<Map<string, number[]>> {
  const assetReturns = new Map<string, number[]>();
  
  console.log(`\n📊 Fetching ${days}-day price history for ${assets.length} assets...`);
  
  for (const asset of assets) {
    console.log(`   Fetching ${asset}...`);
    
    const priceHistory = await getHistoricalPricesFromCoinGecko(asset, days, 'daily');
    
    if (!priceHistory || priceHistory.dataPoints.length < 2) {
      console.warn(`   ⚠️  Insufficient data for ${asset}, using average correlation`);
      continue;
    }
    
    // Calculate daily returns
    const returns: number[] = [];
    for (let i = 1; i < priceHistory.dataPoints.length; i++) {
      const prevPrice = priceHistory.dataPoints[i - 1].price;
      const currPrice = priceHistory.dataPoints[i].price;
      const dailyReturn = Math.log(currPrice / prevPrice);
      returns.push(dailyReturn);
    }
    
    assetReturns.set(asset, returns);
    console.log(`   ✅ ${asset}: ${returns.length} daily returns`);
  }
  
  return assetReturns;
}

/**
 * Calculate correlation between two return series
 */
function calculateCorrelation(returns1: number[], returns2: number[]): number {
  const n = Math.min(returns1.length, returns2.length);
  if (n < 2) return 0;
  
  // Calculate means
  const mean1 = returns1.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const mean2 = returns2.slice(0, n).reduce((a, b) => a + b, 0) / n;
  
  // Calculate covariance and standard deviations
  let covariance = 0;
  let variance1 = 0;
  let variance2 = 0;
  
  for (let i = 0; i < n; i++) {
    const diff1 = returns1[i] - mean1;
    const diff2 = returns2[i] - mean2;
    covariance += diff1 * diff2;
    variance1 += diff1 * diff1;
    variance2 += diff2 * diff2;
  }
  
  covariance /= n;
  variance1 /= n;
  variance2 /= n;
  
  const stdDev1 = Math.sqrt(variance1);
  const stdDev2 = Math.sqrt(variance2);
  
  if (stdDev1 === 0 || stdDev2 === 0) return 0;
  
  return covariance / (stdDev1 * stdDev2);
}

/**
 * Build correlation matrix from asset returns
 */
function buildCorrelationMatrix(
  assets: string[],
  assetReturns: Map<string, number[]>
): CorrelationMatrix {
  const n = assets.length;
  const matrix: number[][] = [];
  
  for (let i = 0; i < n; i++) {
    matrix[i] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) {
        matrix[i][j] = 1.0; // Self-correlation is 1
      } else {
        const returns1 = assetReturns.get(assets[i]);
        const returns2 = assetReturns.get(assets[j]);
        
        if (returns1 && returns2) {
          matrix[i][j] = calculateCorrelation(returns1, returns2);
        } else {
          // If data missing, assume moderate correlation
          matrix[i][j] = 0.5;
        }
      }
    }
  }
  
  return { assets, matrix };
}

/**
 * Calculate portfolio volatility using correlation matrix
 */
function calculatePortfolioVolatility(
  positions: PortfolioPosition[],
  correlationMatrix: CorrelationMatrix
): { portfolioVolatility: number; diversificationBenefit: number } {
  const n = positions.length;
  
  // Create weight and volatility vectors
  const weights = positions.map(p => p.weight / 100);
  const volatilities = positions.map(p => p.volatility || 0);
  
  // Calculate weighted average volatility (no diversification)
  const avgVolatility = positions.reduce((sum, p, i) => 
    sum + (p.weight / 100) * volatilities[i], 0
  );
  
  // Calculate portfolio variance using correlation matrix
  let portfolioVariance = 0;
  
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const wi = weights[i];
      const wj = weights[j];
      const voli = volatilities[i];
      const volj = volatilities[j];
      
      // Find correlation between positions
      let correlation = 0;
      if (i === j) {
        correlation = 1.0;
      } else {
        // For simplicity, use average correlation from matrix
        // In practice, would map position assets to correlation matrix
        correlation = 0.5; // Moderate default correlation
      }
      
      portfolioVariance += wi * wj * voli * volj * correlation;
    }
  }
  
  const portfolioVolatility = Math.sqrt(portfolioVariance);
  const diversificationBenefit = ((avgVolatility - portfolioVolatility) / avgVolatility) * 100;
  
  return { portfolioVolatility, diversificationBenefit };
}

/**
 * Parse position JSON and extract key metrics
 */
function parsePosition(posJson: PositionJSON, index: number): PortfolioPosition {
  const allocation = posJson.config.initialInvestment;
  const expectedReturn = posJson.analysis.returns.expectedReturn;
  const returnPercent = posJson.analysis.returns.expectedReturnPercent;
  
  // Extract volatility
  let volatility = 0;
  if (posJson.analysis.distribution?.stdDeviation) {
    volatility = posJson.analysis.distribution.stdDeviation / allocation; // Normalize to percentage
  } else if (posJson.marketConditions?.distributionParams?.sigma) {
    volatility = posJson.marketConditions.distributionParams.sigma;
  }
  
  // Extract Sharpe ratio
  let sharpeRatio: number | null = null;
  if (posJson.productType === 'Lending' && (posJson.analysis as any).productSpecific?.sharpeRatio) {
    sharpeRatio = (posJson.analysis as any).productSpecific.sharpeRatio;
  }
  
  // Extract assets
  let assets: string[] = [];
  if (posJson.productType === 'Lending' && posJson.config.asset) {
    assets = [posJson.config.asset];
  } else if (posJson.config.pair) {
    assets = posJson.config.pair.split('-');
  }
  
  return {
    file: `Position ${index + 1}`,
    type: posJson.productType,
    assets,
    allocation,
    weight: 0, // Will be calculated later
    expectedReturn,
    returnPercent,
    volatility,
    sharpeRatio,
  };
}

/**
 * Calculate portfolio-level metrics
 */
async function evaluatePortfolio(positions: PositionJSON[]): Promise<PortfolioMetrics> {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║              PORTFOLIO EVALUATION & ANALYSIS                   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  
  // Parse all positions
  const portfolioPositions = positions.map((p, i) => parsePosition(p, i));
  
  // Calculate total investment and weights
  const totalInvestment = portfolioPositions.reduce((sum, p) => sum + p.allocation, 0);
  portfolioPositions.forEach(p => {
    p.weight = (p.allocation / totalInvestment) * 100;
  });
  
  console.log(`\n📊 Portfolio Overview:`);
  console.log(`   Total Investment: $${totalInvestment.toLocaleString()}`);
  console.log(`   Number of Positions: ${portfolioPositions.length}`);
  console.log(`   Position Types: ${[...new Set(portfolioPositions.map(p => p.type))].join(', ')}`);
  
  // Calculate weighted returns
  const expectedFinalValue = portfolioPositions.reduce(
    (sum, p) => sum + p.allocation + p.expectedReturn, 0
  );
  const expectedReturn = expectedFinalValue - totalInvestment;
  const expectedReturnPercent = (expectedReturn / totalInvestment) * 100;
  
  // Use weighted average period for annualization
  const avgPeriod = positions.reduce((sum, p) => sum + p.config.periodDays, 0) / positions.length;
  const annualizedAPY = (Math.pow(expectedFinalValue / totalInvestment, 365 / avgPeriod) - 1) * 100;
  
  // Extract unique assets for correlation analysis
  const uniqueAssets = extractAssets(positions);
  console.log(`\n🔗 Identified ${uniqueAssets.length} unique assets for correlation analysis:`);
  console.log(`   ${uniqueAssets.join(', ')}`);
  
  // Fetch historical data and build correlation matrix
  const assetReturns = await fetchAssetReturns(uniqueAssets, Math.floor(avgPeriod));
  const correlationMatrix = buildCorrelationMatrix(uniqueAssets, assetReturns);
  
  // Calculate average correlation
  let corrSum = 0;
  let corrCount = 0;
  for (let i = 0; i < correlationMatrix.matrix.length; i++) {
    for (let j = i + 1; j < correlationMatrix.matrix[i].length; j++) {
      corrSum += correlationMatrix.matrix[i][j];
      corrCount++;
    }
  }
  const avgCorrelation = corrCount > 0 ? corrSum / corrCount : 0;
  
  // Calculate portfolio volatility with diversification
  const { portfolioVolatility, diversificationBenefit } = 
    calculatePortfolioVolatility(portfolioPositions, correlationMatrix);
  
  const portfolioVariance = portfolioVolatility * portfolioVolatility;
  
  // Calculate VaR (Value at Risk) using normal distribution approximation
  const z_005 = 1.645; // 95% confidence (5% tail)
  const z_001 = 2.326; // 99% confidence (1% tail)
  
  const valueAtRisk5 = totalInvestment * portfolioVolatility * z_005;
  const valueAtRisk1 = totalInvestment * portfolioVolatility * z_001;
  
  // Conditional VaR (Expected Shortfall) - average loss beyond VaR
  const conditionalVaR5 = totalInvestment * portfolioVolatility * (Math.exp(-z_005 * z_005 / 2) / (Math.sqrt(2 * Math.PI) * 0.05));
  
  // Sharpe Ratio (assuming 0% risk-free rate)
  const sharpeRatio = portfolioVolatility > 0 ? expectedReturnPercent / (portfolioVolatility * 100) : 0;
  
  // Sortino Ratio (downside risk only) - simplified
  const sortinoRatio = sharpeRatio * Math.sqrt(2); // Approximation
  
  return {
    totalInvestment,
    expectedFinalValue,
    expectedReturn,
    expectedReturnPercent,
    annualizedAPY,
    
    portfolioVolatility,
    portfolioVariance,
    diversificationBenefit,
    
    valueAtRisk5,
    valueAtRisk1,
    conditionalVaR5,
    sharpeRatio,
    sortinoRatio,
    
    avgCorrelation,
    correlationMatrix,
    
    positions: portfolioPositions,
  };
}

/**
 * Display portfolio metrics
 */
function displayResults(metrics: PortfolioMetrics): void {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('PORTFOLIO RETURNS');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  console.log(`💰 Expected Returns:`);
  console.log(`   Initial Investment:    $${metrics.totalInvestment.toLocaleString()}`);
  console.log(`   Expected Final Value:  $${metrics.expectedFinalValue.toLocaleString()}`);
  console.log(`   Expected Return:       $${metrics.expectedReturn.toLocaleString()} (${metrics.expectedReturnPercent.toFixed(2)}%)`);
  console.log(`   Annualized APY:        ${metrics.annualizedAPY.toFixed(2)}%`);
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('PORTFOLIO RISK METRICS');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  console.log(`📉 Volatility & Variance:`);
  console.log(`   Portfolio Volatility:  ${(metrics.portfolioVolatility * 100).toFixed(2)}%`);
  console.log(`   Portfolio Variance:    ${(metrics.portfolioVariance * 10000).toFixed(4)}`);
  console.log(`   Diversification Benefit: ${metrics.diversificationBenefit.toFixed(2)}%`);
  
  console.log(`\n⚠️  Value at Risk (VaR):`);
  console.log(`   5% VaR (1-day):        $${metrics.valueAtRisk5.toFixed(2)}`);
  console.log(`   1% VaR (1-day):        $${metrics.valueAtRisk1.toFixed(2)}`);
  console.log(`   Conditional VaR (5%):  $${metrics.conditionalVaR5.toFixed(2)}`);
  
  console.log(`\n📊 Risk-Adjusted Returns:`);
  console.log(`   Sharpe Ratio:          ${metrics.sharpeRatio.toFixed(3)}`);
  console.log(`   Sortino Ratio:         ${metrics.sortinoRatio.toFixed(3)}`);
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('CORRELATION ANALYSIS');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  console.log(`🔗 Asset Correlations:`);
  console.log(`   Average Correlation:   ${(metrics.avgCorrelation * 100).toFixed(2)}%`);
  
  if (metrics.correlationMatrix.assets.length > 0) {
    console.log(`\n   Correlation Matrix:`);
    const assets = metrics.correlationMatrix.assets;
    
    // Header
    console.log(`   ${''.padEnd(8)} ${assets.map(a => a.padEnd(8)).join(' ')}`);
    
    // Rows
    for (let i = 0; i < assets.length; i++) {
      const row = metrics.correlationMatrix.matrix[i]
        .map(v => v.toFixed(2).padStart(8))
        .join(' ');
      console.log(`   ${assets[i].padEnd(8)} ${row}`);
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('POSITION BREAKDOWN');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  for (const pos of metrics.positions) {
    console.log(`📍 ${pos.type} - ${pos.assets.join('/')}:`);
    console.log(`   Allocation:       $${pos.allocation.toLocaleString()} (${pos.weight.toFixed(1)}%)`);
    console.log(`   Expected Return:  $${pos.expectedReturn.toFixed(2)} (${pos.returnPercent.toFixed(2)}%)`);
    console.log(`   Volatility:       ${(pos.volatility * 100).toFixed(2)}%`);
    if (pos.sharpeRatio !== null) {
      console.log(`   Sharpe Ratio:     ${pos.sharpeRatio.toFixed(3)}`);
    }
    console.log();
  }
}

/**
 * Save portfolio analysis to JSON
 */
function saveResults(metrics: PortfolioMetrics): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `Portfolio_Analysis_${timestamp}.json`;
  const outputDir = path.join(process.cwd(), 'agents', 'json_store_positions');
  const filepath = path.join(outputDir, filename);
  
  const output = {
    timestamp: new Date().toISOString(),
    portfolioMetrics: {
      investment: metrics.totalInvestment,
      expectedFinalValue: metrics.expectedFinalValue,
      expectedReturn: metrics.expectedReturn,
      expectedReturnPercent: metrics.expectedReturnPercent,
      annualizedAPY: metrics.annualizedAPY,
      volatility: metrics.portfolioVolatility,
      variance: metrics.portfolioVariance,
      diversificationBenefit: metrics.diversificationBenefit,
      valueAtRisk5: metrics.valueAtRisk5,
      valueAtRisk1: metrics.valueAtRisk1,
      conditionalVaR5: metrics.conditionalVaR5,
      sharpeRatio: metrics.sharpeRatio,
      sortinoRatio: metrics.sortinoRatio,
    },
    correlationAnalysis: {
      averageCorrelation: metrics.avgCorrelation,
      correlationMatrix: metrics.correlationMatrix,
    },
    positions: metrics.positions,
  };
  
  fs.writeFileSync(filepath, JSON.stringify(output, null, 2));
  console.log(`\n💾 Portfolio analysis saved to: ${filename}\n`);
}

// ═══════════════════════════════════════════════════════════════
// Main Execution
// ═══════════════════════════════════════════════════════════════

async function main() {
  // Configuration: specify position files to include in portfolio
  // Edit this array to include your desired positions
  const POSITION_FILES = [
    'LPV2_USDT-WBNB_365d_2026-02-17T15-43-53-427Z.json',
    'LPV3_USDT-WBNB_90d_2026-02-17T16-16-59-379Z.json',
    'Lending_Venus_USDT_30d_2026-02-17T15-44-55-766Z.json',
  ];
  
  console.log('Starting portfolio evaluation...');
  console.log(`Analyzing ${POSITION_FILES.length} positions\n`);
  
  // Load positions
  const positions = loadPositionFiles(POSITION_FILES);
  
  if (positions.length === 0) {
    console.error('❌ No valid positions found. Check file paths.');
    return;
  }
  
  console.log(`✅ Loaded ${positions.length} positions`);
  
  // Evaluate portfolio
  const metrics = await evaluatePortfolio(positions);
  
  // Display results
  displayResults(metrics);
  
  // Save results
  saveResults(metrics);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

// Export for use as library
export { evaluatePortfolio, loadPositionFiles, type PortfolioMetrics, type PortfolioPosition };
