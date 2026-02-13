/**
 * OpenClaw Agent Configuration for FlowCap
 * This config integrates the FlowCap skills with OpenClaw runtime
 */

import type { AgentConfig } from 'openclaw';

export const openclawConfig: AgentConfig = {
  // Agent Identity
  name: 'FlowCap',
  description: 'Autonomous DeFi wealth management agent for BNB Chain',
  version: '1.0.0',

  // System Prompt (loaded from soul.md)
  systemPrompt: `
You are **FlowCap**, an autonomous DeFi wealth management agent operating on BNB Chain.
Your purpose is to optimize yield for users who have delegated their funds through Session Keys (ERC-4337 Account Abstraction).

Core Mission: Maximize risk-adjusted returns for users while maintaining strict security boundaries.
You operate as a **restricted operator** with delegated permissions - never as a custodian of user funds.

SECURITY GUARDRAILS - NEVER DO:
1. Transfer funds to external addresses (Anti-drainage policy)
2. Interact with unwhitelisted contracts
3. Execute trades with excessive slippage
4. Reallocate if gas cost exceeds 7-day profit
5. Skip risk analysis before any reallocation

ALWAYS DO:
1. Verify protocol risk score before any interaction
2. Check account health before and after operations
3. Calculate gas profitability before executing
4. Log all decisions with reasoning
5. Notify user of significant actions
6. Respect session key permissions - only allowed functions

You have access to skills for:
- Getting pool data (getPools)
- Analyzing pools (analyzePool)
- Executing swaps/deposits (execSwap)
`,

  // Model Configuration
  model: {
    provider: 'anthropic', // or 'openai', 'google', etc.
    name: 'claude-3-5-sonnet-20241022',
    temperature: 0.3, // Lower temperature for financial decisions
    maxTokens: 4096,
  },

  // Tools/Skills Configuration
  tools: [
    {
      name: 'getPools',
      description: 'Get all available yield pools on BNB Chain filtered by risk profile',
      parameters: {
        type: 'object',
        properties: {
          riskProfile: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
            description: 'Risk profile: low (stablecoins), medium (liquid staking), high (volatile)',
          },
        },
      },
    },
    {
      name: 'analyzePool',
      description: 'Analyze a specific pool to get APY, TVL, risk score, and warnings',
      parameters: {
        type: 'object',
        properties: {
          poolId: {
            type: 'string',
            description: 'Pool identifier (e.g., "venus-usdt", "pancakeswap-cake-bnb")',
          },
          poolAddress: {
            type: 'string',
            description: 'Optional: Pool contract address for on-chain verification',
          },
        },
        required: ['poolId'],
      },
    },
    {
      name: 'comparePools',
      description: 'Compare two pools side-by-side to help make reallocation decisions',
      parameters: {
        type: 'object',
        properties: {
          poolId1: {
            type: 'string',
            description: 'First pool identifier',
          },
          poolAddress1: {
            type: 'string',
            description: 'First pool contract address',
          },
          poolId2: {
            type: 'string',
            description: 'Second pool identifier',
          },
          poolAddress2: {
            type: 'string',
            description: 'Second pool contract address',
          },
        },
        required: ['poolId1', 'poolId2'],
      },
    },
    {
      name: 'executeReallocation',
      description: 'Execute a reallocation transaction using the delegated session key. ONLY call after thorough analysis and profitability checks.',
      parameters: {
        type: 'object',
        properties: {
          fromPoolId: {
            type: 'string',
            description: 'Source pool to withdraw from',
          },
          toPoolId: {
            type: 'string',
            description: 'Destination pool to deposit to',
          },
          amount: {
            type: 'string',
            description: 'Amount to reallocate (in token units)',
          },
          slippageTolerance: {
            type: 'number',
            description: 'Slippage tolerance in percentage (e.g., 0.5 for 0.5%)',
          },
        },
        required: ['fromPoolId', 'toPoolId', 'amount', 'slippageTolerance'],
      },
    },
    {
      name: 'getSwapQuote',
      description: 'Get a quote for swapping between two tokens (does not execute)',
      parameters: {
        type: 'object',
        properties: {
          tokenIn: {
            type: 'string',
            description: 'Input token symbol (e.g., USDT, BNB)',
          },
          tokenOut: {
            type: 'string',
            description: 'Output token symbol',
          },
          amountIn: {
            type: 'string',
            description: 'Amount of input token',
          },
        },
        required: ['tokenIn', 'tokenOut', 'amountIn'],
      },
    },
    {
      name: 'checkSessionKeyStatus',
      description: 'Check the status and remaining validity of the session key',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  ],

  // Session Management
  sessions: {
    // Store session state (positions, last check time, etc.)
    enableMemory: true,
    maxMessages: 100,
  },

  // Automation Settings
  automation: {
    // Run autonomous scans every 5 minutes
    enabled: true,
    checkInterval: 5 * 60 * 1000, // 5 minutes in milliseconds

    // Autonomous trigger conditions
    triggers: [
      {
        name: 'yield_opportunity',
        description: 'Trigger when a better yield opportunity is found',
        condition: 'apyImprovement > 1% AND gasCostRecoveryDays < 7',
      },
      {
        name: 'risk_alert',
        description: 'Trigger when protocol risk increases',
        condition: 'riskScoreChange > 10',
      },
    ],
  },

  // Security Settings
  security: {
    // Session Key Permissions
    sessionKey: {
      enabled: true,
      validityPeriod: 7 * 24 * 60 * 60, // 7 days

      // Allowed contracts (whitelist)
      allowedTargets: [
        '0x10ED43C718714eb63d5aA57B78B54704E256024E', // PancakeSwap Router V2
        '0xfD36E2c2a6789Db23113685031d7F16329158384', // Venus Comptroller
        '0xA07c5b74C9B40447a954e1466938b865b6BBea36', // Venus vBNB
        '0xfD5840Cd36d94D7229439859C0112a4185BC0255', // Venus vUSDT
        '0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8', // Venus vUSDC
      ],

      // Blocked functions (anti-drainage)
      blockedFunctions: [
        '0xa9059cbb', // transfer
        '0x23b872dd', // transferFrom
      ],

      // Maximum transaction value
      maxTxValue: 10000, // USD
    },

    // Rate limiting
    rateLimits: {
      transactions: {
        perHour: 10,
        perDay: 50,
      },
    },
  },

  // Notification Settings
  notifications: {
    telegram: {
      enabled: true,
      events: [
        'reallocation_executed',
        'yield_opportunity_found',
        'risk_alert',
        'session_key_expiring',
        'error',
      ],
    },
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: 'json',
    includeTimestamp: true,
  },

  // Extensions (optional OpenClaw plugins)
  extensions: [
    // Telegram integration for notifications
    {
      name: 'telegram',
      enabled: !!process.env.TELEGRAM_BOT_TOKEN,
      config: {
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        chatId: process.env.TELEGRAM_CHAT_ID,
      },
    },
  ],
};

export default openclawConfig;
