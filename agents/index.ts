/**
 * FlowCap Agent Entry Point
 * Autonomous DeFi Wealth Manager for BNB Chain
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { join } from 'path';

// Import skills
import getYields, { YieldData, analyzeYieldOpportunity } from './skills/getYields.js';
import execSwap, { executeSwap, supplyToVenus, withdrawFromVenus, isSwapProfitable } from './skills/execSwap.js';
import riskScanner, { analyzeProtocolRisk, checkAccountHealth, getRiskAdjustedRecommendations } from './skills/riskScanner.js';

// Types
interface AgentConfig {
  agent: {
    name: string;
    version: string;
  };
  strategy: {
    minAPYImprovement: number;
    minHoldingPeriod: number;
    checkInterval: number;
    maxGasPrice: number;
  };
  riskProfiles: Record<string, {
    name: string;
    allowedProtocols: string[];
    allowedTokens: string[];
    maxSlippage: number;
  }>;
}

interface AgentState {
  isRunning: boolean;
  lastCheck: Date | null;
  currentPositions: Map<string, { protocol: string; asset: string; apy: number; entryDate: Date }>;
  riskProfile: 'low' | 'medium' | 'high';
  smartAccountAddress: `0x${string}` | null;
}

// Load configuration
function loadConfig(): AgentConfig {
  const configPath = join(import.meta.dirname, 'config.yaml');
  const configFile = readFileSync(configPath, 'utf-8');
  return parseYaml(configFile) as AgentConfig;
}

// Agent state
const state: AgentState = {
  isRunning: false,
  lastCheck: null,
  currentPositions: new Map(),
  riskProfile: 'low',
  smartAccountAddress: null,
};

/**
 * Initialize the agent with user configuration
 */
export async function initializeAgent(
  smartAccountAddress: `0x${string}`,
  riskProfile: 'low' | 'medium' | 'high' = 'low'
): Promise<void> {
  console.log('🚀 Initializing FlowCap Agent...');

  state.smartAccountAddress = smartAccountAddress;
  state.riskProfile = riskProfile;

  // Verify session key is configured
  if (!process.env.SESSION_PRIVATE_KEY) {
    throw new Error('SESSION_PRIVATE_KEY not configured. Please set up session key delegation.');
  }

  // Check account health
  const health = await checkAccountHealth(smartAccountAddress);
  console.log(`📊 Account Health: ${health.liquidationRisk} risk, Health Factor: ${health.healthFactor}`);

  console.log(`✅ Agent initialized for ${smartAccountAddress}`);
  console.log(`   Risk Profile: ${riskProfile}`);
}

/**
 * Scan for yield opportunities and execute if profitable
 */
export async function scanAndOptimize(): Promise<{
  action: 'none' | 'reallocated' | 'error';
  details: string;
  txHash?: string;
}> {
  const config = loadConfig();

  console.log('🔍 Scanning for yield opportunities...');
  state.lastCheck = new Date();

  try {
    // Get current yields
    const yields = await getYields.getAllYields();
    const allYields = [...yields.venus, ...yields.pancakeswap];

    console.log(`   Found ${allYields.length} yield opportunities`);

    // Get risk-adjusted recommendations
    const protocols = ['venus', 'pancakeswap'];
    const recommendations = await getRiskAdjustedRecommendations(state.riskProfile, protocols);

    if (recommendations.recommended.length === 0) {
      return { action: 'none', details: 'No protocols meet risk criteria' };
    }

    // Get best yield for current risk profile
    const bestYields = await getYields.getBestYields(state.riskProfile, config.strategy.minAPYImprovement, 5);

    if (bestYields.length === 0) {
      return { action: 'none', details: 'No yields meet minimum APY threshold' };
    }

    const bestYield = bestYields[0];
    console.log(`   Best opportunity: ${bestYield.protocol} ${bestYield.pool} at ${bestYield.apy}% APY`);

    // Check if we have existing positions to compare
    for (const [positionId, position] of state.currentPositions) {
      // Check minimum holding period
      const daysSinceEntry = (Date.now() - position.entryDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceEntry < config.strategy.minHoldingPeriod) {
        console.log(`   Position ${positionId} too new (${daysSinceEntry.toFixed(1)} days). Skipping.`);
        continue;
      }

      // Analyze if reallocation is worth it
      const analysis = await analyzeYieldOpportunity(
        position.protocol,
        position.asset,
        position.apy,
        state.riskProfile
      );

      if (analysis.shouldReallocate && analysis.bestYield) {
        console.log(`   📈 Reallocation recommended: ${analysis.recommendation}`);

        // Check profitability after gas
        const profitability = await isSwapProfitable(
          {
            tokenIn: position.asset,
            tokenOut: analysis.bestYield.asset,
            amountIn: '1000', // Example amount
            slippageTolerance: config.riskProfiles[state.riskProfile].maxSlippage,
            recipient: state.smartAccountAddress!,
          },
          position.apy,
          analysis.bestYield.apy
        );

        if (profitability.profitable) {
          console.log(`   💰 ${profitability.recommendation}`);

          // Execute the reallocation
          // 1. Withdraw from current position
          // 2. Swap if needed
          // 3. Supply to new position

          return {
            action: 'reallocated',
            details: `Moved from ${position.protocol} to ${analysis.bestYield.protocol} for +${analysis.apyDifference.toFixed(2)}% APY`,
          };
        } else {
          console.log(`   ⏳ ${profitability.recommendation}`);
        }
      }
    }

    return { action: 'none', details: 'Current positions are optimal' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error during scan:', errorMessage);
    return { action: 'error', details: errorMessage };
  }
}

/**
 * Start the agent monitoring loop
 */
export async function startAgent(): Promise<void> {
  const config = loadConfig();

  if (!state.smartAccountAddress) {
    throw new Error('Agent not initialized. Call initializeAgent first.');
  }

  console.log(`\n🤖 ${config.agent.name} v${config.agent.version}`);
  console.log('   Starting autonomous monitoring...\n');

  state.isRunning = true;

  while (state.isRunning) {
    const result = await scanAndOptimize();
    console.log(`   Result: ${result.action} - ${result.details}\n`);

    // Wait for next check interval
    await new Promise(resolve => setTimeout(resolve, config.strategy.checkInterval));
  }
}

/**
 * Stop the agent
 */
export function stopAgent(): void {
  console.log('🛑 Stopping agent...');
  state.isRunning = false;
}

/**
 * Get current agent status
 */
export function getAgentStatus(): {
  isRunning: boolean;
  lastCheck: Date | null;
  riskProfile: string;
  positionCount: number;
} {
  return {
    isRunning: state.isRunning,
    lastCheck: state.lastCheck,
    riskProfile: state.riskProfile,
    positionCount: state.currentPositions.size,
  };
}

// Export skills for direct access
export {
  getYields,
  execSwap,
  riskScanner,
  executeSwap,
  supplyToVenus,
  withdrawFromVenus,
  analyzeProtocolRisk,
  checkAccountHealth,
};

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const smartAccount = process.env.AGENT_WALLET_ADDRESS as `0x${string}`;
  const riskProfile = (process.env.RISK_PROFILE || 'low') as 'low' | 'medium' | 'high';

  if (!smartAccount) {
    console.error('❌ AGENT_WALLET_ADDRESS not set in environment');
    process.exit(1);
  }

  initializeAgent(smartAccount, riskProfile)
    .then(() => startAgent())
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}
