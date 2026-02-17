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
import { notifyReallocation, notifyError, sendNotification } from './notifications';

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

    // If no existing positions, first scan → pick the best pool and track it
    if (state.currentPositions.size === 0) {
      console.log(`   No existing positions. Tracking best pool: ${bestPool.poolId} at ${bestPool.apy.toFixed(2)}% APY`);
      state.currentPositions.set(bestPool.poolId, {
        protocol: bestPool.protocol,
        asset: bestPool.assets?.[0] || 'unknown',
        apy: bestPool.apy,
        entryDate: new Date(),
      });
      return { action: 'none', details: `Initial position tracked: ${bestPool.poolId} at ${bestPool.apy.toFixed(2)}% APY` };
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

        // F1: Execute the reallocation
        const bestPoolData = riskFilteredPools.find(p => p.poolId === bestPool.poolId);
        if (!bestPoolData) {
          return { action: 'none', details: 'Could not find best pool data for execution' };
        }

        try {
          const reallocationResult = await execSwap.executeReallocation({
            currentPool: currentPool as any,
            currentAmount: '1000', // TODO: fetch actual position size
            targetPool: bestPoolData as any,
            smartAccountAddress: state.smartAccountAddress!,
            slippageTolerance: config.riskProfiles[state.riskProfile].maxSlippage,
          });

          if (reallocationResult.success) {
            // F3: Update tracked positions
            state.currentPositions.delete(positionId);
            state.currentPositions.set(bestPool.poolId, {
              protocol: bestPool.protocol,
              asset: bestPool.assets?.[0] || 'unknown',
              apy: bestPool.apy,
              entryDate: new Date(),
            });

            const txHash = reallocationResult.steps
              .map(s => s.result.transactionHash)
              .filter(Boolean)[0];

            console.log(`   ✅ Reallocation executed: ${currentPool.name} → ${bestPool.poolId}`);

            // F5: Telegram notification
            await notifyReallocation(
              currentPool.name,
              bestPool.poolId,
              apyDifference,
              txHash
            );

            return {
              action: 'reallocated' as const,
              details: `Reallocated from ${currentPool.name} to ${bestPool.poolId} (+${apyDifference.toFixed(2)}% APY)`,
              txHash: txHash,
            };
          } else {
            console.error(`   ❌ Reallocation failed: ${reallocationResult.error}`);
            return {
              action: 'error' as const,
              details: `Reallocation failed: ${reallocationResult.error}`,
            };
          }
        } catch (execError) {
          const msg = execError instanceof Error ? execError.message : 'Unknown execution error';
          console.error(`   ❌ Execution error: ${msg}`);
          return { action: 'error' as const, details: msg };
        }
      } else {
        console.log(`   ⏳ ${profitability.recommendation}`);
      }
    }

    return { action: 'none', details: 'Current positions are optimal' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error during scan:', errorMessage);
    await notifyError('Scan Error', errorMessage);
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

  // F5: Notify agent start
  await sendNotification({
    event: 'agent_started',
    title: 'FlowCap Agent Started',
    message: `Autonomous monitoring active for ${state.smartAccountAddress} (${state.riskProfile} risk).`,
  });

  // F7: Graceful shutdown
  const shutdown = () => {
    console.log('\n🛑 Graceful shutdown requested...');
    state.isRunning = false;
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    while (state.isRunning) {
      const result = await scanAndOptimize();
      console.log(`   Result: ${result.action} - ${result.details}\n`);

      // Wait for next check interval (interruptible)
      await new Promise(resolve => {
        const timer = setTimeout(resolve, config.strategy.checkInterval);
        // Allow early exit on stop
        const check = () => {
          if (!state.isRunning) {
            clearTimeout(timer);
            resolve(undefined);
          } else {
            setTimeout(check, 1000);
          }
        };
        setTimeout(check, 1000);
      });
    }
  } finally {
    process.removeListener('SIGINT', shutdown);
    process.removeListener('SIGTERM', shutdown);
    await sendNotification({
      event: 'agent_stopped',
      title: 'FlowCap Agent Stopped',
      message: 'Autonomous monitoring has been stopped.',
    });
    console.log('✅ Agent stopped cleanly.');
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
