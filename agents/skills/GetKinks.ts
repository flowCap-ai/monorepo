/**
 * GetKinks.ts
 * 
 * Retrieves interest rate model parameters (kinks) for lending protocols
 * 
 * Most protocols use a "Jump Rate Model" with one kink:
 * - Below kink: borrowRate = baseRate + (utilization * multiplier)
 * - Above kink: borrowRate = baseRate + (kink * multiplier) + ((utilization - kink) * jumpMultiplier)
 * 
 * Some protocols (like Aave V3) use two-slope or more complex models.
 */

interface InterestRateModel {
  modelType: 'JumpRate' | 'TwoSlope' | 'Linear' | 'Custom';
  baseRatePerYear: number;      // Base borrow rate (e.g., 0.02 = 2%)
  multiplierPerYear: number;    // Slope before kink
  jumpMultiplierPerYear: number; // Slope after kink
  kink: number;                 // Optimal utilization (e.g., 0.8 = 80%)
  reserveFactor: number;        // Protocol reserve (e.g., 0.1 = 10%)
  
  // Optional: For two-kink models
  kink2?: number;
  jumpMultiplier2PerYear?: number;
}

interface ProtocolKinks {
  protocol: string;
  asset: string;
  chain: string;
  model: InterestRateModel;
  timestamp: number;
}

/**
 * Default interest rate models for common assets
 * Based on common DeFi lending protocol configurations
 */
const DEFAULT_MODELS: Record<string, Partial<Record<string, InterestRateModel>>> = {
  // Stablecoins (low volatility)
  stablecoin: {
    default: {
      modelType: 'JumpRate',
      baseRatePerYear: 0.00,           // 0%
      multiplierPerYear: 0.04,         // 4% slope
      jumpMultiplierPerYear: 0.60,     // 60% steep slope after kink
      kink: 0.80,                      // 80% optimal utilization
      reserveFactor: 0.10              // 10% to reserves
    }
  },
  
  // Major assets (BTC, ETH, BNB)
  major: {
    default: {
      modelType: 'JumpRate',
      baseRatePerYear: 0.00,
      multiplierPerYear: 0.045,
      jumpMultiplierPerYear: 0.80,
      kink: 0.75,                      // 75% optimal
      reserveFactor: 0.15
    }
  },
  
  // Volatile/Alt assets
  volatile: {
    default: {
      modelType: 'JumpRate',
      baseRatePerYear: 0.02,           // 2% base
      multiplierPerYear: 0.07,
      jumpMultiplierPerYear: 3.00,     // Very steep after kink
      kink: 0.45,                      // Lower optimal (45%)
      reserveFactor: 0.20
    }
  }
};

/**
 * Protocol-specific model overrides
 */
const PROTOCOL_SPECIFIC_MODELS: Record<string, Partial<Record<string, InterestRateModel>>> = {
  Venus: {
    USDT: {
      modelType: 'JumpRate',
      baseRatePerYear: 0.00,
      multiplierPerYear: 0.048,
      jumpMultiplierPerYear: 0.69,
      kink: 0.80,
      reserveFactor: 0.05
    },
    USDC: {
      modelType: 'JumpRate',
      baseRatePerYear: 0.00,
      multiplierPerYear: 0.048,
      jumpMultiplierPerYear: 0.69,
      kink: 0.80,
      reserveFactor: 0.05
    },
    BNB: {
      modelType: 'JumpRate',
      baseRatePerYear: 0.00,
      multiplierPerYear: 0.056,
      jumpMultiplierPerYear: 3.00,
      kink: 0.70,
      reserveFactor: 0.25
    }
  },
  
  Aave: {
    USDT: {
      modelType: 'TwoSlope',
      baseRatePerYear: 0.00,
      multiplierPerYear: 0.04,
      jumpMultiplierPerYear: 0.60,
      kink: 0.90,                      // Aave uses higher kink
      reserveFactor: 0.10
    },
    USDC: {
      modelType: 'TwoSlope',
      baseRatePerYear: 0.00,
      multiplierPerYear: 0.04,
      jumpMultiplierPerYear: 0.60,
      kink: 0.90,
      reserveFactor: 0.10
    }
  },
  
  Compound: {
    USDT: {
      modelType: 'JumpRate',
      baseRatePerYear: 0.00,
      multiplierPerYear: 0.04,
      jumpMultiplierPerYear: 0.80,
      kink: 0.80,
      reserveFactor: 0.10
    },
    USDC: {
      modelType: 'JumpRate',
      baseRatePerYear: 0.00,
      multiplierPerYear: 0.04,
      jumpMultiplierPerYear: 0.80,
      kink: 0.80,
      reserveFactor: 0.10
    }
  }
};

/**
 * Categorize asset by risk profile
 */
function categorizeAsset(asset: string): 'stablecoin' | 'major' | 'volatile' {
  const stablecoins = ['USDT', 'USDC', 'BUSD', 'DAI', 'USDD', 'TUSD', 'FRAX'];
  const majors = ['BTC', 'ETH', 'BNB', 'WBTC', 'WETH', 'WBNB'];
  
  const assetUpper = asset.toUpperCase();
  
  if (stablecoins.some(s => assetUpper.includes(s))) return 'stablecoin';
  if (majors.some(m => assetUpper.includes(m))) return 'major';
  return 'volatile';
}

/**
 * Calculate borrow APY at a given utilization rate
 */
export function calculateBorrowAPY(
  utilization: number,
  model: InterestRateModel
): number {
  if (utilization <= model.kink) {
    // Below kink: linear slope
    return model.baseRatePerYear + (utilization * model.multiplierPerYear);
  } else {
    // Above kink: jump rate
    const baseRate = model.baseRatePerYear;
    const normalRate = model.kink * model.multiplierPerYear;
    const excessUtilization = utilization - model.kink;
    const excessRate = excessUtilization * model.jumpMultiplierPerYear;
    
    return baseRate + normalRate + excessRate;
  }
}

/**
 * Calculate supply APY from borrow APY and utilization
 */
export function calculateSupplyAPY(
  utilization: number,
  model: InterestRateModel
): number {
  const borrowAPY = calculateBorrowAPY(utilization, model);
  const supplyAPY = borrowAPY * utilization * (1 - model.reserveFactor);
  return supplyAPY;
}

/**
 * Main function to get interest rate model (kinks)
 */
export async function getKinks(
  protocol: string,  // e.g., "Venus", "Aave", "Compound"
  asset: string,     // e.g., "USDT", "USDC", "BNB"
  chain: string = 'BSC'
): Promise<ProtocolKinks> {
  console.log(`\n📈 Fetching interest rate model for ${protocol} ${asset} on ${chain}...\n`);
  
  // Try to get protocol-specific model
  let model: InterestRateModel | undefined;
  
  if (PROTOCOL_SPECIFIC_MODELS[protocol]?.[asset]) {
    model = PROTOCOL_SPECIFIC_MODELS[protocol][asset];
    console.log(`   ✅ Found protocol-specific model for ${protocol} ${asset}`);
  } else {
    // Fall back to default model based on asset category
    const category = categorizeAsset(asset);
    model = DEFAULT_MODELS[category].default;
    console.log(`   ⚠️  Using default ${category} model (protocol-specific not found)`);
  }
  
  if (!model) {
    throw new Error(`No interest rate model found for ${asset}`);
  }
  
  console.log('\n   Interest Rate Model Parameters:');
  console.log(`   Model Type:        ${model.modelType}`);
  console.log(`   Base Rate:         ${(model.baseRatePerYear * 100).toFixed(2)}%`);
  console.log(`   Multiplier:        ${(model.multiplierPerYear * 100).toFixed(2)}%`);
  console.log(`   Jump Multiplier:   ${(model.jumpMultiplierPerYear * 100).toFixed(2)}%`);
  console.log(`   Kink:              ${(model.kink * 100).toFixed(0)}%`);
  console.log(`   Reserve Factor:    ${(model.reserveFactor * 100).toFixed(0)}%`);
  
  // Show example rates at different utilizations
  console.log('\n   Example APYs:');
  [0.5, 0.7, model.kink, 0.9, 0.95].forEach(u => {
    const borrowAPY = calculateBorrowAPY(u, model!);
    const supplyAPY = calculateSupplyAPY(u, model!);
    console.log(`   U=${(u * 100).toFixed(0)}%: Borrow=${(borrowAPY * 100).toFixed(2)}%, Supply=${(supplyAPY * 100).toFixed(2)}%`);
  });
  
  console.log();
  
  return {
    protocol,
    asset,
    chain,
    model,
    timestamp: Date.now()
  };
}

// Export types and calculation functions
export type { InterestRateModel, ProtocolKinks };
