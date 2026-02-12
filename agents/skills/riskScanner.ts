import { createPublicClient, http, formatUnits, type Address } from 'viem';
import { bsc } from 'viem/chains';

// Environment variables
const BNB_RPC_URL = process.env.BNB_RPC_URL || 'https://bsc-dataseed1.binance.org';
const DEFILLAMA_API_URL = process.env.DEFILLAMA_API_URL || 'https://yields.llama.fi';

// Venus Protocol addresses
const VENUS_COMPTROLLER = (process.env.VENUS_COMPTROLLER || '0xfD36E2c2a6789Db23113685031d7F16329158384') as Address;

// ABIs for risk assessment
const COMPTROLLER_ABI = [
  {
    name: 'getAccountLiquidity',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [
      { name: 'error', type: 'uint256' },
      { name: 'liquidity', type: 'uint256' },
      { name: 'shortfall', type: 'uint256' },
    ],
  },
  {
    name: 'markets',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'vToken', type: 'address' }],
    outputs: [
      { name: 'isListed', type: 'bool' },
      { name: 'collateralFactorMantissa', type: 'uint256' },
      { name: 'isVenus', type: 'bool' },
    ],
  },
] as const;

const VTOKEN_ABI = [
  {
    name: 'borrowRatePerBlock',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'supplyRatePerBlock',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'totalBorrows',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'totalSupply',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'getCash',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'exchangeRateStored',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
] as const;

// Known protocol addresses
const VENUS_MARKETS: Record<string, Address> = {
  vBNB: '0xA07c5b74C9B40447a954e1466938b865b6BBea36',
  vUSDT: '0xfD5840Cd36d94D7229439859C0112a4185BC0255',
  vUSDC: '0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8',
  vBUSD: '0x95c78222B3D6e262426483D42CfA53685A67Ab9D',
  vETH: '0xf508fCD89b8bd15579dc79A6827cB4686A3592c8',
  vBTC: '0x882C173bC7Ff3b7786CA16dfeD3DFFfb9Ee7847B',
};

// Create client
const client = createPublicClient({
  chain: bsc,
  transport: http(BNB_RPC_URL),
});

export interface ProtocolRiskScore {
  protocol: string;
  overallScore: number; // 0-100, higher is safer
  tvlScore: number;
  utilizationScore: number;
  auditScore: number;
  ageScore: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  details: {
    tvl: number;
    utilizationRate: number;
    isAudited: boolean;
    daysActive: number;
    incidents: number;
  };
  warnings: string[];
  lastUpdated: Date;
}

export interface MarketHealthData {
  market: string;
  totalSupply: number;
  totalBorrows: number;
  utilizationRate: number;
  liquidity: number;
  collateralFactor: number;
  healthScore: number;
}

export interface AccountHealthData {
  address: Address;
  totalSupplied: number;
  totalBorrowed: number;
  healthFactor: number;
  liquidationRisk: 'none' | 'low' | 'medium' | 'high';
  recommendation: string;
}

// Known protocol data (in production, fetch from DeFiLlama or on-chain)
const PROTOCOL_METADATA: Record<string, {
  launchDate: Date;
  isAudited: boolean;
  auditors: string[];
  incidents: number;
  category: string;
}> = {
  venus: {
    launchDate: new Date('2020-09-28'),
    isAudited: true,
    auditors: ['CertiK', 'Hacken', 'PeckShield'],
    incidents: 1, // May 2021 incident
    category: 'lending',
  },
  pancakeswap: {
    launchDate: new Date('2020-09-20'),
    isAudited: true,
    auditors: ['CertiK', 'SlowMist', 'PeckShield'],
    incidents: 0,
    category: 'dex',
  },
  alpaca: {
    launchDate: new Date('2021-02-26'),
    isAudited: true,
    auditors: ['CertiK', 'PeckShield'],
    incidents: 0,
    category: 'leveraged-yield',
  },
};

/**
 * Fetch protocol TVL from DeFiLlama
 */
async function getProtocolTVL(protocolSlug: string): Promise<number> {
  try {
    const response = await fetch(`https://api.llama.fi/tvl/${protocolSlug}`);
    if (!response.ok) return 0;
    const tvl = await response.json();
    return typeof tvl === 'number' ? tvl : 0;
  } catch {
    return 0;
  }
}

/**
 * Calculate TVL risk score (0-100)
 * Higher TVL = Lower risk = Higher score
 */
function calculateTVLScore(tvl: number): number {
  if (tvl >= 1_000_000_000) return 100; // $1B+ = max score
  if (tvl >= 500_000_000) return 90;
  if (tvl >= 100_000_000) return 80;
  if (tvl >= 50_000_000) return 70;
  if (tvl >= 10_000_000) return 60;
  if (tvl >= 5_000_000) return 50;
  if (tvl >= 1_000_000) return 40;
  if (tvl >= 500_000) return 30;
  if (tvl >= 100_000) return 20;
  return 10;
}

/**
 * Calculate utilization score (0-100)
 * Optimal utilization is 70-80%, too high is risky
 */
function calculateUtilizationScore(utilizationRate: number): number {
  if (utilizationRate >= 0.7 && utilizationRate <= 0.8) return 100;
  if (utilizationRate >= 0.6 && utilizationRate < 0.7) return 90;
  if (utilizationRate >= 0.8 && utilizationRate < 0.85) return 85;
  if (utilizationRate >= 0.5 && utilizationRate < 0.6) return 80;
  if (utilizationRate >= 0.85 && utilizationRate < 0.9) return 70;
  if (utilizationRate >= 0.4 && utilizationRate < 0.5) return 70;
  if (utilizationRate >= 0.9 && utilizationRate < 0.95) return 50;
  if (utilizationRate >= 0.95) return 20; // Critical - near insolvency
  return 60; // Low utilization is not ideal but safe
}

/**
 * Calculate audit score (0-100)
 */
function calculateAuditScore(metadata: typeof PROTOCOL_METADATA[string]): number {
  if (!metadata.isAudited) return 20;

  let score = 50; // Base score for being audited

  // More auditors = higher confidence
  score += Math.min(metadata.auditors.length * 10, 30);

  // Deduct for incidents
  score -= metadata.incidents * 15;

  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate age score (0-100)
 * Older protocols that have survived are more battle-tested
 */
function calculateAgeScore(launchDate: Date): number {
  const daysActive = Math.floor((Date.now() - launchDate.getTime()) / (1000 * 60 * 60 * 24));

  if (daysActive >= 1095) return 100; // 3+ years
  if (daysActive >= 730) return 90;  // 2+ years
  if (daysActive >= 365) return 80;  // 1+ year
  if (daysActive >= 180) return 60;  // 6+ months
  if (daysActive >= 90) return 40;   // 3+ months
  if (daysActive >= 30) return 25;   // 1+ month
  return 10; // Very new - high risk
}

/**
 * Determine risk level from score
 */
function getRiskLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
  if (score >= 75) return 'low';
  if (score >= 50) return 'medium';
  if (score >= 25) return 'high';
  return 'critical';
}

/**
 * Analyze protocol risk score
 */
export async function analyzeProtocolRisk(protocol: string): Promise<ProtocolRiskScore> {
  const protocolLower = protocol.toLowerCase();
  const metadata = PROTOCOL_METADATA[protocolLower];
  const warnings: string[] = [];

  // Fetch TVL
  const tvl = await getProtocolTVL(protocolLower);

  // Default values for unknown protocols
  let utilizationRate = 0.65;
  let isAudited = false;
  let daysActive = 0;
  let incidents = 0;

  if (metadata) {
    isAudited = metadata.isAudited;
    daysActive = Math.floor((Date.now() - metadata.launchDate.getTime()) / (1000 * 60 * 60 * 24));
    incidents = metadata.incidents;
  } else {
    warnings.push('Unknown protocol - limited risk data available');
  }

  // Fetch utilization for Venus markets
  if (protocolLower === 'venus') {
    try {
      const marketData = await getVenusMarketHealth('vUSDT');
      utilizationRate = marketData.utilizationRate;
    } catch {
      warnings.push('Could not fetch on-chain utilization data');
    }
  }

  // Calculate scores
  const tvlScore = calculateTVLScore(tvl);
  const utilizationScore = calculateUtilizationScore(utilizationRate);
  const auditScore = metadata ? calculateAuditScore(metadata) : 20;
  const ageScore = metadata ? calculateAgeScore(metadata.launchDate) : 10;

  // Weighted overall score
  const overallScore = Math.round(
    tvlScore * 0.30 +
    utilizationScore * 0.25 +
    auditScore * 0.25 +
    ageScore * 0.20
  );

  // Generate warnings
  if (tvlScore < 50) warnings.push('Low TVL - potential liquidity risk');
  if (utilizationRate > 0.9) warnings.push('High utilization - withdrawal delays possible');
  if (!isAudited) warnings.push('No audits found - smart contract risk');
  if (daysActive < 90) warnings.push('New protocol - limited track record');
  if (incidents > 0) warnings.push(`${incidents} past security incident(s)`);

  return {
    protocol,
    overallScore,
    tvlScore,
    utilizationScore,
    auditScore,
    ageScore,
    riskLevel: getRiskLevel(overallScore),
    details: {
      tvl,
      utilizationRate,
      isAudited,
      daysActive,
      incidents,
    },
    warnings,
    lastUpdated: new Date(),
  };
}

/**
 * Get Venus market health data
 */
export async function getVenusMarketHealth(market: string): Promise<MarketHealthData> {
  const marketAddress = VENUS_MARKETS[market];

  if (!marketAddress) {
    throw new Error(`Unknown Venus market: ${market}`);
  }

  const [totalSupply, totalBorrows, cash, marketInfo] = await Promise.all([
    client.readContract({
      address: marketAddress,
      abi: VTOKEN_ABI,
      functionName: 'totalSupply',
    }),
    client.readContract({
      address: marketAddress,
      abi: VTOKEN_ABI,
      functionName: 'totalBorrows',
    }),
    client.readContract({
      address: marketAddress,
      abi: VTOKEN_ABI,
      functionName: 'getCash',
    }),
    client.readContract({
      address: VENUS_COMPTROLLER,
      abi: COMPTROLLER_ABI,
      functionName: 'markets',
      args: [marketAddress],
    }),
  ]);

  const totalSupplyNum = Number(formatUnits(totalSupply, 8)); // vTokens have 8 decimals
  const totalBorrowsNum = Number(formatUnits(totalBorrows, 18));
  const liquidity = Number(formatUnits(cash, 18));
  const collateralFactor = Number(formatUnits(marketInfo[1], 18));

  const totalAssets = liquidity + totalBorrowsNum;
  const utilizationRate = totalAssets > 0 ? totalBorrowsNum / totalAssets : 0;

  // Health score based on utilization and liquidity
  let healthScore = 100;
  if (utilizationRate > 0.95) healthScore = 20;
  else if (utilizationRate > 0.9) healthScore = 40;
  else if (utilizationRate > 0.85) healthScore = 60;
  else if (utilizationRate > 0.8) healthScore = 80;

  return {
    market,
    totalSupply: totalSupplyNum,
    totalBorrows: totalBorrowsNum,
    utilizationRate,
    liquidity,
    collateralFactor,
    healthScore,
  };
}

/**
 * Check account health on Venus
 */
export async function checkAccountHealth(accountAddress: Address): Promise<AccountHealthData> {
  const [, liquidity, shortfall] = await client.readContract({
    address: VENUS_COMPTROLLER,
    abi: COMPTROLLER_ABI,
    functionName: 'getAccountLiquidity',
    args: [accountAddress],
  });

  const liquidityNum = Number(formatUnits(liquidity, 18));
  const shortfallNum = Number(formatUnits(shortfall, 18));

  let liquidationRisk: 'none' | 'low' | 'medium' | 'high';
  let recommendation: string;
  let healthFactor: number;

  if (shortfallNum > 0) {
    liquidationRisk = 'high';
    healthFactor = 0;
    recommendation = `CRITICAL: Account has $${shortfallNum.toFixed(2)} shortfall. Immediate action required to avoid liquidation.`;
  } else if (liquidityNum < 100) {
    liquidationRisk = 'high';
    healthFactor = 1.0 + (liquidityNum / 1000);
    recommendation = `WARNING: Low liquidity buffer ($${liquidityNum.toFixed(2)}). Consider repaying debt or adding collateral.`;
  } else if (liquidityNum < 1000) {
    liquidationRisk = 'medium';
    healthFactor = 1.5;
    recommendation = `CAUTION: Moderate liquidity ($${liquidityNum.toFixed(2)}). Monitor position closely.`;
  } else if (liquidityNum < 10000) {
    liquidationRisk = 'low';
    healthFactor = 2.0;
    recommendation = `Position is healthy with $${liquidityNum.toFixed(2)} buffer.`;
  } else {
    liquidationRisk = 'none';
    healthFactor = 5.0;
    recommendation = `Position is very safe with $${liquidityNum.toFixed(2)} excess collateral.`;
  }

  return {
    address: accountAddress,
    totalSupplied: 0, // Would need to iterate through markets
    totalBorrowed: 0,
    healthFactor,
    liquidationRisk,
    recommendation,
  };
}

/**
 * Compare risk between two protocols
 */
export async function compareProtocolRisk(
  protocol1: string,
  protocol2: string
): Promise<{
  safer: string;
  riskDifference: number;
  recommendation: string;
  comparison: { protocol1: ProtocolRiskScore; protocol2: ProtocolRiskScore };
}> {
  const [risk1, risk2] = await Promise.all([
    analyzeProtocolRisk(protocol1),
    analyzeProtocolRisk(protocol2),
  ]);

  const safer = risk1.overallScore >= risk2.overallScore ? protocol1 : protocol2;
  const riskDifference = Math.abs(risk1.overallScore - risk2.overallScore);

  let recommendation: string;
  if (riskDifference < 10) {
    recommendation = `Both protocols have similar risk profiles. Choose based on yield.`;
  } else if (riskDifference < 25) {
    recommendation = `${safer} is moderately safer. Consider the yield difference to decide.`;
  } else {
    recommendation = `${safer} is significantly safer. Strongly prefer unless yield difference is substantial.`;
  }

  return {
    safer,
    riskDifference,
    recommendation,
    comparison: { protocol1: risk1, protocol2: risk2 },
  };
}

/**
 * Generate risk-adjusted recommendations
 */
export async function getRiskAdjustedRecommendations(
  userRiskProfile: 'low' | 'medium' | 'high',
  protocols: string[]
): Promise<{
  recommended: Array<{ protocol: string; score: number; reason: string }>;
  avoid: Array<{ protocol: string; score: number; reason: string }>;
}> {
  const riskScores = await Promise.all(
    protocols.map(p => analyzeProtocolRisk(p))
  );

  const minScore = userRiskProfile === 'low' ? 70 : userRiskProfile === 'medium' ? 50 : 25;

  const recommended = riskScores
    .filter(r => r.overallScore >= minScore)
    .sort((a, b) => b.overallScore - a.overallScore)
    .map(r => ({
      protocol: r.protocol,
      score: r.overallScore,
      reason: `Risk level: ${r.riskLevel}. TVL: $${(r.details.tvl / 1_000_000).toFixed(1)}M`,
    }));

  const avoid = riskScores
    .filter(r => r.overallScore < minScore)
    .map(r => ({
      protocol: r.protocol,
      score: r.overallScore,
      reason: r.warnings.join('. ') || 'Does not meet risk threshold',
    }));

  return { recommended, avoid };
}

// Export for use by the agent
export default {
  analyzeProtocolRisk,
  getVenusMarketHealth,
  checkAccountHealth,
  compareProtocolRisk,
  getRiskAdjustedRecommendations,
};
