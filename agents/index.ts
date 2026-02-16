/**
 * FlowCap Agent Entry Point
 * Autonomous DeFi Wealth Manager for BNB Chain
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { join } from 'path';

// Import skills
import * as getPoolData from './skills/getPoolData';
import * as analyzePool from './skills/analyzePool';
import * as execSwap from './skills/execSwap';
import * as getPools from './skills/getPools';

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

  // TODO: Implement account health check
  console.log(`📊 Account initialized for ${smartAccountAddress}`);

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
    // Get all available pools
    const allPools = await getPools.getAllPools();

    // Filter by risk profile
    const riskFilteredPools = getPools.filterPoolsByRisk(allPools, state.riskProfile);

    console.log(`   Found ${riskFilteredPools.length} pools matching ${state.riskProfile} risk profile`);

    if (riskFilteredPools.length === 0) {
      return { action: 'none', details: 'No pools meet risk criteria' };
    }

    // Analyze each pool to get APY data
    const poolAnalyses = await Promise.all(
      riskFilteredPools.slice(0, 10).map(pool =>
        analyzePool.analyzePool(pool.poolId, pool.address)
          .catch(() => null)
      )
    );

    const validAnalyses = poolAnalyses.filter((a): a is NonNullable<typeof a> => a !== null);

    if (validAnalyses.length === 0) {
      return { action: 'none', details: 'Could not analyze any pools' };
    }

    // Sort by APY
    validAnalyses.sort((a, b) => b.apy - a.apy);
    const bestPool = validAnalyses[0];

    console.log(`   Best opportunity: ${bestPool.protocol} ${bestPool.poolId} at ${bestPool.apy.toFixed(2)}% APY`);

    // Check if we have existing positions to compare
    if (state.currentPositions.size === 0) {
      console.log(`   No existing positions. Consider starting with ${bestPool.poolId}`);
      return { action: 'none', details: `Best pool: ${bestPool.poolId} at ${bestPool.apy.toFixed(2)}% APY` };
    }

    // Check existing positions for reallocation opportunities
    for (const [positionId, position] of state.currentPositions) {
      // Check minimum holding period
      const daysSinceEntry = (Date.now() - position.entryDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceEntry < config.strategy.minHoldingPeriod) {
        console.log(`   Position ${positionId} too new (${daysSinceEntry.toFixed(1)} days). Skipping.`);
        continue;
      }

      // Find current pool data
      const currentPool = allPools.find(p => p.poolId === positionId);
      if (!currentPool) {
        console.log(`   Could not find pool data for ${positionId}`);
        continue;
      }

      // Check if best pool is significantly better
      const apyDifference = bestPool.apy - position.apy;
      if (apyDifference < config.strategy.minAPYImprovement) {
        console.log(`   APY improvement too small: +${apyDifference.toFixed(2)}%`);
        continue;
      }

      console.log(`   📈 Reallocation opportunity: +${apyDifference.toFixed(2)}% APY`);

      // Check profitability after gas
      const profitability = await execSwap.isSwapProfitable(
        {
          tokenIn: currentPool.underlyingTokens?.[0] || currentPool.address,
          tokenOut: bestPool.assets[0],
          amountIn: '1000', // Example amount
          slippageTolerance: config.riskProfiles[state.riskProfile].maxSlippage,
          recipient: state.smartAccountAddress!,
        },
        position.apy,
        bestPool.apy
      );

      if (profitability.profitable) {
        console.log(`   💰 ${profitability.recommendation}`);

        // TODO: Execute the reallocation using execSwap.executeReallocation
        // For now, just return the recommendation
        return {
          action: 'none',
          details: `Reallocation recommended: ${currentPool.name} → ${bestPool.poolId} (+${apyDifference.toFixed(2)}% APY)`,
        };
      } else {
        console.log(`   ⏳ ${profitability.recommendation}`);
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
  getPoolData,
  getPools,
  analyzePool,
  execSwap,
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
