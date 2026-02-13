/**
 * OpenClaw Tool Implementations
 * Bridge between OpenClaw runtime and FlowCap skills
 */

import type { Tool, ToolExecutionContext } from 'openclaw';
import getPools from './skills/getPools.js';
import analyzePool from './skills/analyzePool.js';
import execSwap from './skills/execSwap.js';
import type { Address } from 'viem';

// Session state management
interface SessionState {
  smartAccountAddress?: Address;
  riskProfile: 'low' | 'medium' | 'high';
  currentPositions: Map<string, {
    poolId: string;
    amount: string;
    entryDate: Date;
    apy: number;
  }>;
  lastCheck?: Date;
}

// Store session state in OpenClaw memory
const sessionState: SessionState = {
  riskProfile: (process.env.RISK_PROFILE as any) || 'low',
  currentPositions: new Map(),
};

/**
 * Tool: getPools
 * Discover all available yield pools filtered by risk profile
 */
export const getPoolsTool: Tool = {
  name: 'getPools',
  description: 'Get all available yield pools on BNB Chain filtered by risk profile',

  async execute(params: { riskProfile?: string }, context: ToolExecutionContext) {
    const riskProfile = params.riskProfile || sessionState.riskProfile;

    try {
      // Get all pools
      const allPools = await getPools.getAllPools();

      // Filter by risk profile
      const filteredPools = getPools.filterPoolsByRisk(
        allPools,
        riskProfile as 'low' | 'medium' | 'high'
      );

      return {
        success: true,
        data: {
          totalPools: allPools.length,
          filteredPools: filteredPools.length,
          riskProfile,
          pools: filteredPools.map(p => ({
            poolId: p.poolId,
            name: p.name,
            protocol: p.protocol,
            assets: p.assets,
            riskLevel: p.riskLevel,
            address: p.address,
          })),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch pools',
      };
    }
  },
};

/**
 * Tool: analyzePool
 * Analyze a specific pool for APY, TVL, risk, and warnings
 */
export const analyzePoolTool: Tool = {
  name: 'analyzePool',
  description: 'Analyze a specific pool to get APY, TVL, risk score, and warnings',

  async execute(params: { poolId: string; poolAddress?: string }, context: ToolExecutionContext) {
    try {
      const analysis = await analyzePool.analyzePool(
        params.poolId,
        params.poolAddress as Address | undefined
      );

      return {
        success: true,
        data: {
          poolId: analysis.poolId,
          protocol: analysis.protocol,
          assets: analysis.assets,
          apy: analysis.apy,
          apyBase: analysis.apyBase,
          apyReward: analysis.apyReward,
          tvl: analysis.tvl,
          utilizationRate: analysis.utilizationRate,
          riskScore: analysis.riskScore,
          riskLevel: analysis.riskLevel,
          warnings: analysis.warnings,
          recommendations: analysis.recommendations,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to analyze pool',
      };
    }
  },
};

/**
 * Tool: comparePools
 * Compare two pools side-by-side
 */
export const comparePoolsTool: Tool = {
  name: 'comparePools',
  description: 'Compare two pools side-by-side to help make reallocation decisions',

  async execute(
    params: {
      poolId1: string;
      poolAddress1?: string;
      poolId2: string;
      poolAddress2?: string;
    },
    context: ToolExecutionContext
  ) {
    try {
      const comparison = await analyzePool.comparePools(
        params.poolId1,
        params.poolAddress1 as Address | undefined,
        params.poolId2,
        params.poolAddress2 as Address | undefined
      );

      return {
        success: true,
        data: {
          pool1: {
            poolId: comparison.pool1.poolId,
            apy: comparison.pool1.apy,
            tvl: comparison.pool1.tvl,
            riskScore: comparison.pool1.riskScore,
            riskLevel: comparison.pool1.riskLevel,
          },
          pool2: {
            poolId: comparison.pool2.poolId,
            apy: comparison.pool2.apy,
            tvl: comparison.pool2.tvl,
            riskScore: comparison.pool2.riskScore,
            riskLevel: comparison.pool2.riskLevel,
          },
          apyDifference: comparison.apyDifference,
          riskDifference: comparison.riskDifference,
          recommendation: comparison.recommendation,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to compare pools',
      };
    }
  },
};

/**
 * Tool: getSwapQuote
 * Get a quote for token swap (no execution)
 */
export const getSwapQuoteTool: Tool = {
  name: 'getSwapQuote',
  description: 'Get a quote for swapping between two tokens without executing',

  async execute(
    params: { tokenIn: string; tokenOut: string; amountIn: string },
    context: ToolExecutionContext
  ) {
    try {
      if (!sessionState.smartAccountAddress) {
        return {
          success: false,
          error: 'Smart account address not configured. Initialize session first.',
        };
      }

      const quote = await execSwap.getSwapQuote({
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        amountIn: params.amountIn,
        slippageTolerance: 0.5,
        recipient: sessionState.smartAccountAddress,
      });

      return {
        success: true,
        data: {
          tokenIn: quote.tokenIn,
          tokenOut: quote.tokenOut,
          amountIn: quote.amountIn,
          amountOut: quote.amountOut,
          priceImpact: quote.priceImpact,
          estimatedGasWei: quote.estimatedGas.toString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get swap quote',
      };
    }
  },
};

/**
 * Tool: executeReallocation
 * Execute a yield reallocation using session key
 */
export const executeReallocationTool: Tool = {
  name: 'executeReallocation',
  description:
    'Execute a reallocation transaction using the delegated session key. ONLY call after thorough analysis.',

  async execute(
    params: {
      fromPoolId: string;
      toPoolId: string;
      amount: string;
      slippageTolerance: number;
    },
    context: ToolExecutionContext
  ) {
    try {
      if (!sessionState.smartAccountAddress) {
        return {
          success: false,
          error: 'Smart account address not configured. Initialize session first.',
        };
      }

      // Validate session key is configured
      if (!process.env.SESSION_PRIVATE_KEY) {
        return {
          success: false,
          error: 'Session key not configured. User must delegate permissions first.',
        };
      }

      // Parse pool IDs to determine operations
      const fromProtocol = params.fromPoolId.split('-')[0];
      const toProtocol = params.toPoolId.split('-')[0];
      const fromAsset = params.fromPoolId.split('-')[1]?.toUpperCase();
      const toAsset = params.toPoolId.split('-')[1]?.toUpperCase();

      console.log(
        `🔄 Executing reallocation: ${params.fromPoolId} → ${params.toPoolId} (${params.amount})`
      );

      // Step 1: Withdraw from source pool
      let withdrawResult;
      if (fromProtocol === 'venus') {
        withdrawResult = await execSwap.withdrawFromVenus(
          fromAsset,
          params.amount,
          sessionState.smartAccountAddress
        );

        if (!withdrawResult.success) {
          return {
            success: false,
            error: `Failed to withdraw from Venus: ${withdrawResult.error}`,
          };
        }
      }

      // Step 2: Swap if needed
      let swapResult;
      if (fromAsset !== toAsset) {
        swapResult = await execSwap.executeSwap({
          tokenIn: fromAsset,
          tokenOut: toAsset,
          amountIn: params.amount,
          slippageTolerance: params.slippageTolerance,
          recipient: sessionState.smartAccountAddress,
        });

        if (!swapResult.success) {
          return {
            success: false,
            error: `Failed to swap ${fromAsset} to ${toAsset}: ${swapResult.error}`,
          };
        }
      }

      // Step 3: Supply to destination pool
      let supplyResult;
      if (toProtocol === 'venus') {
        supplyResult = await execSwap.supplyToVenus(
          toAsset,
          params.amount,
          sessionState.smartAccountAddress
        );

        if (!supplyResult.success) {
          return {
            success: false,
            error: `Failed to supply to Venus: ${supplyResult.error}`,
          };
        }
      }

      // Update session state
      sessionState.currentPositions.delete(params.fromPoolId);
      sessionState.currentPositions.set(params.toPoolId, {
        poolId: params.toPoolId,
        amount: params.amount,
        entryDate: new Date(),
        apy: 0, // Will be updated on next analysis
      });

      return {
        success: true,
        data: {
          fromPoolId: params.fromPoolId,
          toPoolId: params.toPoolId,
          amount: params.amount,
          withdrawTxHash: withdrawResult?.transactionHash,
          swapTxHash: swapResult?.transactionHash,
          supplyTxHash: supplyResult?.transactionHash,
          finalTxHash:
            supplyResult?.transactionHash || swapResult?.transactionHash || withdrawResult?.transactionHash,
          gasUsed: supplyResult?.gasUsed?.toString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to execute reallocation',
      };
    }
  },
};

/**
 * Tool: checkSessionKeyStatus
 * Check session key validity and permissions
 */
export const checkSessionKeyStatusTool: Tool = {
  name: 'checkSessionKeyStatus',
  description: 'Check the status and remaining validity of the session key',

  async execute(params: {}, context: ToolExecutionContext) {
    try {
      const sessionKeyConfigured = !!process.env.SESSION_PRIVATE_KEY;
      const smartAccountConfigured = !!sessionState.smartAccountAddress;

      // In production, query the session key module on-chain for actual expiry
      const validityPeriod = 7 * 24 * 60 * 60 * 1000; // 7 days
      const estimatedExpiry = sessionState.lastCheck
        ? new Date(sessionState.lastCheck.getTime() + validityPeriod)
        : null;

      return {
        success: true,
        data: {
          sessionKeyConfigured,
          smartAccountConfigured,
          smartAccountAddress: sessionState.smartAccountAddress,
          riskProfile: sessionState.riskProfile,
          positionCount: sessionState.currentPositions.size,
          lastCheck: sessionState.lastCheck,
          estimatedExpiry,
          daysRemaining: estimatedExpiry
            ? Math.floor((estimatedExpiry.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
            : null,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to check session key status',
      };
    }
  },
};

/**
 * Initialize session with user configuration
 */
export function initializeSession(smartAccountAddress: Address, riskProfile: 'low' | 'medium' | 'high') {
  sessionState.smartAccountAddress = smartAccountAddress;
  sessionState.riskProfile = riskProfile;
  sessionState.lastCheck = new Date();

  console.log(`✅ Session initialized for ${smartAccountAddress} with ${riskProfile} risk profile`);
}

/**
 * Get all tools for registration with OpenClaw
 */
export const allTools: Tool[] = [
  getPoolsTool,
  analyzePoolTool,
  comparePoolsTool,
  getSwapQuoteTool,
  executeReallocationTool,
  checkSessionKeyStatusTool,
];

export default allTools;
