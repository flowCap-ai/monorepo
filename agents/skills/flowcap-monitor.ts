/**
 * FlowCap Monitoring Skill for OpenClaw
 *
 * Monitors delegations directory and manages DeFi yield optimization
 * This skill runs continuously in the background
 */

import { watch, readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import * as getPools from './getPools';
import * as analyzePool from './analyzePool';
import * as analyzeLPV2 from './analyzePool-LPV2';
import * as getPriceHistory from './getPriceHistory';
import * as execSwap from './execSwap';

const DELEGATIONS_DIR = join(homedir(), '.openclaw', 'flowcap-delegations');
const ACTIVE_DELEGATIONS_FILE = join(DELEGATIONS_DIR, 'active.json');

interface Delegation {
  id: string;
  smartAccountAddress: string;
  sessionKey: string;
  sessionAddress: string;
  riskProfile: 'low' | 'medium' | 'high';
  maxInvestment: string;
  chain: {
    id: number;
    name: string;
  };
  permissions: Array<{
    target: string;
    functionSelector: string;
    valueLimit: string;
  }>;
}

interface MonitoringState {
  delegationId: string;
  lastCheck: Date;
  currentPositions: Map<string, {
    protocol: string;
    asset: string;
    apy: number;
    entryDate: Date;
  }>;
}

// Active monitoring states
const monitoringStates = new Map<string, MonitoringState>();

/**
 * Load active delegations
 */
export function loadActiveDelegations(): Delegation[] {
  try {
    if (existsSync(ACTIVE_DELEGATIONS_FILE)) {
      const data = readFileSync(ACTIVE_DELEGATIONS_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      // Handle both array format and object with 'delegations' property
      return Array.isArray(parsed) ? parsed : (parsed.delegations || []);
    }
  } catch (error) {
    console.error('Failed to load delegations:', error);
  }
  return [];
}

/**
 * Start monitoring for a delegation
 */
export async function startMonitoring(delegation: Delegation): Promise<void> {
  console.log(`🔄 Starting monitoring for ${delegation.smartAccountAddress}`);
  console.log(`   Risk Profile: ${delegation.riskProfile}`);
  console.log(`   Max Investment: $${delegation.maxInvestment}`);

  // Initialize monitoring state
  monitoringStates.set(delegation.id, {
    delegationId: delegation.id,
    lastCheck: new Date(),
    currentPositions: new Map(),
  });

  // Start monitoring loop
  monitorLoop(delegation);
}

/**
 * Monitoring loop - runs every 5 minutes
 */
async function monitorLoop(delegation: Delegation): Promise<void> {
  const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

  while (true) {
    try {
      await scanAndOptimize(delegation);
    } catch (error) {
      console.error(`❌ Error in monitoring loop for ${delegation.id}:`, error);
    }

    // Wait for next check
    await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL));
  }
}

/**
 * Scan for yield opportunities and execute if profitable
 */
export async function scanAndOptimize(delegation: Delegation): Promise<any> {
  console.log(`\n🔍 Scanning opportunities for ${delegation.smartAccountAddress}...`);

  let state = monitoringStates.get(delegation.id);
  if (!state) {
    // Initialize state for this delegation
    state = {
      delegationId: delegation.id,
      lastCheck: new Date(),
      currentPositions: new Map(),
    };
    monitoringStates.set(delegation.id, state);
  }

  state.lastCheck = new Date();

  try {
    // Get all available pools
    const allPools = await getPools.getAllPools();

    // Filter by risk profile
    const riskFilteredPools = getPools.filterPoolsByRisk(allPools, delegation.riskProfile);

    console.log(`   Found ${riskFilteredPools.length} pools matching ${delegation.riskProfile} risk profile`);

    if (riskFilteredPools.length === 0) {
      console.log('   No pools meet risk criteria');
      return;
    }

    // Analyze top pools using appropriate analyzer based on pool type
    const poolAnalyses = await Promise.all(
      riskFilteredPools.slice(0, 10).map(async (pool) => {
        try {
          // Route to appropriate analyzer based on pool type and version
          if (pool.type === 'lp-farm' && pool.version === 'v2' && pool.exogenousParams) {
            console.log(`   🔬 Analyzing LP V2 pool: ${pool.poolId}`);

            // Get historical price data for IL calculation
            const priceRatios = await getPriceHistory.getPriceRatioTimeSeries(
              pool.assets[0],
              pool.assets[1],
              365 // 1 year of historical data
            ).catch(() => null);

            if (priceRatios && priceRatios.length > 0) {
              // Run advanced LP V2 mathematical analysis
              const analysis = await analyzeLPV2.analyzeLPV2Position(
                pool.exogenousParams,
                {
                  days: 30,
                  harvestFrequencyHours: 24,
                  priceChangeRatio: 1.0,
                }
              );

              return {
                poolId: pool.poolId,
                protocol: pool.protocol,
                type: pool.type,
                apy: analysis.annualizedAPY,
                analysis,
              };
            } else {
              console.log(`   ⚠️  No price history for ${pool.poolId}, using fallback`);
            }
          }

          // Fallback to generic analyzer for V3, lending, or if V2 fails
          const analysis = await analyzePool.analyzePool(pool.poolId, pool.address);
          return {
            poolId: pool.poolId,
            protocol: analysis.protocol,
            type: pool.type,
            apy: analysis.apy,
            analysis,
          };
        } catch (error) {
          console.log(`   ❌ Failed to analyze ${pool.poolId}:`, error instanceof Error ? error.message : 'Unknown error');
          return null;
        }
      })
    );

    const validAnalyses = poolAnalyses.filter((a): a is NonNullable<typeof a> => a !== null);

    if (validAnalyses.length === 0) {
      console.log('   Could not analyze any pools');
      return;
    }

    // Sort by APY
    validAnalyses.sort((a, b) => b.apy - a.apy);
    const bestPool = validAnalyses[0];

    console.log(`   💎 Best opportunity: ${bestPool.protocol} ${bestPool.poolId} at ${bestPool.apy.toFixed(2)}% APY`);

    // Check if we have existing positions to compare
    if (state.currentPositions.size === 0) {
      console.log(`   No existing positions. Best pool: ${bestPool.poolId} at ${bestPool.apy.toFixed(2)}% APY`);
      // TODO: Could auto-enter first position if configured
      return;
    }

    // Check existing positions for reallocation opportunities
    for (const [positionId, position] of state.currentPositions) {
      // Check minimum holding period
      const daysSinceEntry = (Date.now() - position.entryDate.getTime()) / (1000 * 60 * 60 * 24);
      const minHoldingDays = delegation.riskProfile === 'low' ? 7 : delegation.riskProfile === 'medium' ? 3 : 1;

      if (daysSinceEntry < minHoldingDays) {
        console.log(`   Position ${positionId} too new (${daysSinceEntry.toFixed(1)} days). Skipping.`);
        continue;
      }

      // Check if best pool is significantly better
      const minAPYImprovement = delegation.riskProfile === 'low' ? 2.0 : delegation.riskProfile === 'medium' ? 1.5 : 1.0;
      const apyDifference = bestPool.apy - position.apy;

      if (apyDifference < minAPYImprovement) {
        console.log(`   APY improvement too small: +${apyDifference.toFixed(2)}% (need +${minAPYImprovement}%)`);
        continue;
      }

      console.log(`   📈 Reallocation opportunity: +${apyDifference.toFixed(2)}% APY`);

      // Find current pool data
      const currentPool = allPools.find(p => p.poolId === positionId);
      if (!currentPool) {
        console.log(`   Could not find pool data for ${positionId}`);
        continue;
      }

      // Find best pool data
      const targetPool = allPools.find(p => p.poolId === bestPool.poolId);
      if (!targetPool) {
        console.log(`   Could not find pool data for ${bestPool.poolId}`);
        continue;
      }

      // Check profitability after gas
      const profitability = await execSwap.isSwapProfitable(
        {
          tokenIn: currentPool.underlyingTokens?.[0] || currentPool.address,
          tokenOut: targetPool.underlyingTokens?.[0] || targetPool.address,
          amountIn: delegation.maxInvestment,
          slippageTolerance: delegation.riskProfile === 'low' ? 0.5 : delegation.riskProfile === 'medium' ? 1.0 : 2.0,
          recipient: delegation.smartAccountAddress as `0x${string}`,
        },
        position.apy,
        bestPool.apy
      );

      if (profitability.profitable) {
        console.log(`   💰 ${profitability.recommendation}`);
        console.log(`   🚀 Reallocation opportunity identified!`);
        console.log(`   📝 Session Key: ${delegation.sessionKey.substring(0, 10)}...`);
        console.log(`   📍 From: ${currentPool.name} (${position.apy.toFixed(2)}% APY)`);
        console.log(`   📍 To: ${targetPool.name} (${bestPool.apy.toFixed(2)}% APY)`);
        console.log(`   📈 APY Improvement: +${apyDifference.toFixed(2)}%`);

        // TODO: Execute reallocation using session key via Biconomy UserOp
        // This requires implementing session key signing in Node.js environment
        // For now, we log the opportunity and would need to integrate Biconomy SDK here

        console.log(`   ⚠️  Execution pending - Biconomy session key integration needed`);

      } else {
        console.log(`   ⏳ ${profitability.recommendation}`);
      }
    }

  } catch (error) {
    console.error(`❌ Error during scan:`, error);
  }
}

/**
 * Log reallocation to file
 */
function logReallocation(delegationId: string, fromPool: any, toPool: any, apyGain: number): void {
  const logFile = join(DELEGATIONS_DIR, `reallocation-log-${delegationId}.jsonl`);
  const logEntry = {
    timestamp: new Date().toISOString(),
    from: fromPool.name,
    to: toPool.name,
    apyGain,
  };

  try {
    writeFileSync(logFile, JSON.stringify(logEntry) + '\n', { flag: 'a' });
  } catch (error) {
    console.error('Failed to log reallocation:', error);
  }
}

/**
 * Initialize monitoring for all active delegations
 */
export async function initializeMonitoring(): Promise<void> {
  console.log('🤖 Initializing FlowCap monitoring...');

  const delegations = loadActiveDelegations();

  if (delegations.length === 0) {
    console.log('   No active delegations found');
    return;
  }

  console.log(`   Found ${delegations.length} active delegations`);

  for (const delegation of delegations) {
    await startMonitoring(delegation);
  }

  console.log('✅ FlowCap monitoring initialized\n');
}

/**
 * Watch for new delegations
 */
export function watchForNewDelegations(): void {
  console.log(`👀 Watching for new delegations in ${DELEGATIONS_DIR}...`);

  watch(DELEGATIONS_DIR, async (_eventType, filename) => {
    if (filename && filename.startsWith('monitor-') && filename.endsWith('.json')) {
      console.log(`📥 New monitoring instruction: ${filename}`);

      try {
        const instructionFile = join(DELEGATIONS_DIR, filename);
        const data = readFileSync(instructionFile, 'utf-8');
        const instruction = JSON.parse(data);

        if (instruction.command === 'start-flowcap-monitoring') {
          await startMonitoring(instruction.delegation);
        }
      } catch (error) {
        console.error('Failed to process instruction:', error);
      }
    }
  });
}

// Auto-start if running as main script
// Note: This won't work in ES modules - use openclaw-flowcap.ts instead
