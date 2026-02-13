/**
 * OpenClaw Runtime for FlowCap Agent
 * This is the main entry point that starts the OpenClaw agent
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { Address } from 'viem';
import { allTools, initializeSession } from './openclaw-tools.js';

// Import OpenClaw dynamically to avoid type errors during build
let openclawRuntime: any;

/**
 * Load the soul.md file as the system prompt
 */
function loadSoulPrompt(): string {
  const soulPath = join(import.meta.dirname, 'soul.md');
  return readFileSync(soulPath, 'utf-8');
}

/**
 * Initialize and start the OpenClaw agent
 */
export async function startOpenClawAgent() {
  console.log('🚀 Starting FlowCap Agent with OpenClaw runtime...\n');

  // Validate configuration
  const smartAccountAddress = process.env.AGENT_WALLET_ADDRESS as Address;
  const riskProfile = (process.env.RISK_PROFILE || 'low') as 'low' | 'medium' | 'high';
  const sessionPrivateKey = process.env.SESSION_PRIVATE_KEY;

  if (!smartAccountAddress) {
    console.error('❌ ERROR: AGENT_WALLET_ADDRESS not configured');
    console.error('   Please set your smart account address in .env file');
    process.exit(1);
  }

  if (!sessionPrivateKey) {
    console.error('❌ ERROR: SESSION_PRIVATE_KEY not configured');
    console.error('   Please delegate a session key from the dashboard first');
    console.error('   See process.md for instructions');
    process.exit(1);
  }

  console.log('📋 Configuration:');
  console.log(`   Smart Account: ${smartAccountAddress}`);
  console.log(`   Risk Profile: ${riskProfile}`);
  console.log(`   Session Key: ${sessionPrivateKey.slice(0, 10)}...${sessionPrivateKey.slice(-4)}`);
  console.log(`   BNB RPC: ${process.env.BNB_RPC_URL}`);
  console.log(`   Biconomy Bundler: ${process.env.BICONOMY_BUNDLER_URL?.split('/').slice(0, 5).join('/')}...`);
  console.log('');

  // Initialize session state
  initializeSession(smartAccountAddress, riskProfile);

  try {
    // Dynamically import OpenClaw to avoid type issues
    const openclaw = await import('openclaw');
    openclawRuntime = openclaw;

    // Load soul prompt
    const systemPrompt = loadSoulPrompt();

    // Create OpenClaw agent configuration
    const agentConfig = {
      name: 'FlowCap',
      description: 'Autonomous DeFi Wealth Manager for BNB Chain',
      version: '1.0.0',

      // System prompt from soul.md
      systemPrompt,

      // Model configuration
      model: {
        provider: process.env.AI_PROVIDER || 'anthropic',
        name: process.env.AI_MODEL || 'claude-3-5-sonnet-20241022',
        apiKey: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY,
        temperature: 0.3, // Conservative for financial decisions
        maxTokens: 4096,
      },

      // Register our tools
      tools: allTools,

      // Enable session memory
      memory: {
        enabled: true,
        maxMessages: 100,
      },

      // Logging
      logging: {
        level: process.env.LOG_LEVEL || 'info',
      },
    };

    console.log('🤖 Initializing OpenClaw agent...');
    console.log(`   Model: ${agentConfig.model.name}`);
    console.log(`   Tools: ${allTools.length} skills available`);
    console.log('');

    // Check if OpenClaw has a createAgent or similar function
    // The exact API depends on the OpenClaw version
    if (typeof openclawRuntime.createAgent === 'function') {
      const agent = await openclawRuntime.createAgent(agentConfig);

      console.log('✅ Agent initialized successfully!');
      console.log('');
      console.log('🔍 Agent is now monitoring BNB Chain for yield opportunities...');
      console.log(`   Check interval: ${process.env.REALLOCATION_CHECK_INTERVAL_MS || 300000}ms (5 minutes)`);
      console.log('');
      console.log('💡 The agent will:');
      console.log('   1. Scan for better yield opportunities every 5 minutes');
      console.log('   2. Analyze risk and profitability before any action');
      console.log('   3. Execute reallocations via session key when profitable');
      console.log('   4. Notify you via Telegram of significant events');
      console.log('');
      console.log('Press Ctrl+C to stop the agent');
      console.log('─'.repeat(60));

      // Start the agent loop
      await runAgentLoop(agent);
    } else if (typeof openclawRuntime.Agent === 'function') {
      // Alternative API: class-based
      const agent = new openclawRuntime.Agent(agentConfig);
      await agent.start();
      console.log('✅ Agent started successfully!');
      await runAgentLoop(agent);
    } else {
      console.error('❌ ERROR: Could not find OpenClaw agent initialization method');
      console.error('   OpenClaw API may have changed. Please check documentation.');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Failed to start OpenClaw agent:');
    console.error(error);
    console.error('');
    console.error('💡 Troubleshooting:');
    console.error('   1. Ensure openclaw is installed: npm install openclaw');
    console.error('   2. Check that all environment variables are set in .env');
    console.error('   3. Verify your API keys are valid');
    console.error('   4. Check the OpenClaw documentation for API changes');
    process.exit(1);
  }
}

/**
 * Main agent loop - runs autonomous scans
 */
async function runAgentLoop(agent: any) {
  const checkInterval = parseInt(process.env.REALLOCATION_CHECK_INTERVAL_MS || '300000');

  // Autonomous monitoring loop
  while (true) {
    try {
      const timestamp = new Date().toISOString();
      console.log(`\n[${timestamp}] 🔍 Running autonomous scan...`);

      // Ask the agent to scan for opportunities
      const prompt = `
Check for yield optimization opportunities now. Follow this process:

1. Use getPools to get all pools for the current risk profile (${process.env.RISK_PROFILE || 'low'})
2. Use analyzePool on the top 3-5 most promising pools
3. If you find a better opportunity:
   - Use comparePools to compare current position with the new opportunity
   - Calculate if the 7-day profit covers gas costs + 1% margin
   - If profitable, use executeReallocation
4. Report your findings and decisions

Current time: ${timestamp}
`;

      // Execute autonomous task
      if (typeof agent.run === 'function') {
        const response = await agent.run(prompt);
        console.log('\n📊 Agent Response:');
        console.log(response);
      } else if (typeof agent.execute === 'function') {
        const response = await agent.execute(prompt);
        console.log('\n📊 Agent Response:');
        console.log(response);
      } else {
        console.error('⚠️  Could not execute agent task - unknown API method');
      }

      console.log(`\n⏳ Next scan in ${checkInterval / 1000 / 60} minutes...`);
      console.log('─'.repeat(60));

      // Wait for next interval
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    } catch (error) {
      console.error('\n❌ Error during autonomous scan:');
      console.error(error);
      console.error('\n⏳ Retrying in 1 minute...');

      // Wait 1 minute before retry on error
      await new Promise((resolve) => setTimeout(resolve, 60000));
    }
  }
}

/**
 * Interactive mode - allows manual queries
 */
export async function startInteractiveMode() {
  console.log('🎮 Starting FlowCap Agent in Interactive Mode\n');

  // Similar setup as autonomous mode
  // But instead of loop, listen for user input

  console.log('💬 You can now chat with the agent and ask it to:');
  console.log('   - "Check yield opportunities"');
  console.log('   - "Analyze Venus USDT pool"');
  console.log('   - "Compare Venus USDT with Venus USDC"');
  console.log('   - "What is my current position?"');
  console.log('   - "Reallocate to the best opportunity"');
  console.log('');
  console.log('⚠️  Interactive mode is not yet implemented');
  console.log('   Use autonomous mode for now: npm run dev');
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv[2] || 'autonomous';

  if (mode === 'interactive') {
    startInteractiveMode().catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
  } else {
    startOpenClawAgent().catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
  }
}
