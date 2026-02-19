#!/usr/bin/env tsx
/**
 * FlowCap Agent Startup Script
 *
 * This script:
 * 1. Watches /Users/alex/.openclaw/flowcap-delegations/ for new delegation files
 * 2. Connects to OpenClaw Gateway at ws://127.0.0.1:18789
 * 3. Initializes the agent with soul.md personality
 * 4. Runs autonomous monitoring every 5 minutes
 */

import 'dotenv/config';
import { readFileSync, watch, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { webcrypto } from 'crypto';
import { WebSocket } from 'ws';
import type { Address } from 'viem';
import { initializeAgent, scanAndOptimize, startAgent } from './index.js';

// Configuration
const OPENCLAW_HOME = join(homedir(), '.openclaw');
const DELEGATION_FOLDER = join(OPENCLAW_HOME, 'flowcap-delegations');
const DEVICE_AUTH_PATH = join(OPENCLAW_HOME, 'identity', 'device-auth.json');
const OPENCLAW_GATEWAY = 'ws://127.0.0.1:18789';
const CHECK_INTERVAL = parseInt(process.env.REALLOCATION_CHECK_INTERVAL_MS || '300000'); // 5 minutes

// State
let gatewayConnection: WebSocket | null = null;
let isAgentRunning = false;
let currentDelegation: {
  smartAccountAddress: Address;
  sessionKey: string;
  riskProfile: 'low' | 'medium' | 'high';
} | null = null;

/**
 * Load soul.md for the agent's personality/instructions
 */
function loadSoulPrompt(): string {
  const soulPath = join(import.meta.dirname, 'soul.md');
  return readFileSync(soulPath, 'utf-8');
}

/**
 * Load gateway auth token.
 * Priority: OPENCLAW_GATEWAY_TOKEN env  →  device-auth.json operator token
 */
function loadGatewayToken(): string | null {
  // 1. Explicit env var (recommended — matches OpenClaw's own convention)
  if (process.env.OPENCLAW_GATEWAY_TOKEN) return process.env.OPENCLAW_GATEWAY_TOKEN;

  // 2. Fallback: device-auth operator token
  try {
    if (!existsSync(DEVICE_AUTH_PATH)) {
      console.warn('⚠️  Device auth not found at:', DEVICE_AUTH_PATH);
      return null;
    }

    const auth = JSON.parse(readFileSync(DEVICE_AUTH_PATH, 'utf-8'));
    return auth.tokens?.operator?.token || null;
  } catch (error) {
    console.error('❌ Failed to load gateway token:', error);
    return null;
  }
}

/**
 * Connect to OpenClaw Gateway
 */
function connectToGateway(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    console.log(`🔌 Connecting to OpenClaw Gateway at ${OPENCLAW_GATEWAY}...`);

    const ws = new WebSocket(OPENCLAW_GATEWAY);
    let challengeReceived = false;

    ws.on('open', () => {
      console.log('✅ WebSocket opened, waiting for challenge...');
      gatewayConnection = ws;
    });

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());
        console.log('📨 Raw message from gateway:', JSON.stringify(message, null, 2));

        // Handle connect challenge first
        if (!challengeReceived && message.type === 'event' && message.event === 'connect.challenge') {
          challengeReceived = true;
          console.log('🔐 Received connect challenge, responding...');

          // Load gateway auth token
          const gatewayToken = loadGatewayToken();
          if (!gatewayToken) {
            console.error('❌ Cannot connect without gateway token (set OPENCLAW_GATEWAY_TOKEN)');
            ws.close();
            reject(new Error('Gateway token not found'));
            return;
          }

          console.log(`🔑 Using gateway token: ${gatewayToken.slice(0, 8)}...`);

          // Official OpenClaw Gateway Protocol format from docs.openclaw.ai
          const connectParams = {
            minProtocol: 3,
            maxProtocol: 3,
            client: {
              id: 'gateway-client',
              version: '1.0.0',
              platform: 'server',
              mode: 'backend',
            },
            role: 'operator',
            scopes: ['operator.read', 'operator.write'],
            caps: [],
            commands: [],
            permissions: {},
            auth: {
              token: gatewayToken,
            },
            locale: 'en-US',
            userAgent: 'flowcap-agent/1.0.0',
          };

          const connectRequest = {
            type: 'req',
            id: 'connect-1',
            method: 'connect',
            params: connectParams,
          };

          console.log('📤 Sending connect request (same format as dashboard/server.ts)');
          ws.send(JSON.stringify(connectRequest));

          // Resolve promise after sending connect request
          setTimeout(() => resolve(ws), 100);
        } else {
          // Handle other messages
          handleGatewayMessage(message);
        }
      } catch (error) {
        console.error('❌ Failed to parse gateway message:', error);
        console.error('   Raw data:', data.toString());
      }
    });

    ws.on('error', (error) => {
      console.error('❌ Gateway connection error:', error);
      reject(error);
    });

    ws.on('close', () => {
      console.log('🔌 Disconnected from OpenClaw Gateway');
      gatewayConnection = null;

      // Attempt to reconnect after 5 seconds
      setTimeout(() => {
        console.log('🔄 Attempting to reconnect to gateway...');
        connectToGateway().catch((err) => {
          console.error('Failed to reconnect:', err);
        });
      }, 5000);
    });
  });
}

/**
 * Handle messages from OpenClaw Gateway
 */
function handleGatewayMessage(message: any) {
  const messageType = message.type || 'unknown';

  // Handle response messages
  if (messageType === 'res') {
    const isSuccess = message.ok === true;
    console.log(`${isSuccess ? '✅' : '❌'} Response received: id=${message.id}, ok=${message.ok}`);

    if (message.id === 'connect-1') {
      if (isSuccess) {
        console.log('🎉 Successfully connected to OpenClaw Gateway!');
        console.log('   Agent is now registered and ready to communicate');
      } else {
        console.error('❌ Connection failed:', message.error?.message || 'Unknown error');
        if (message.error) {
          console.error('   Error code:', message.error.code);
          console.error('   Error details:', message.error.message);
        }
      }
    }
    return;
  }

  // Handle event messages
  if (messageType === 'event') {
    const eventName = message.event;
    console.log(`📢 Gateway event: ${eventName}`);

    switch (eventName) {
      case 'connect.challenge':
        // This is handled in the message listener above
        break;

      case 'pairing.request':
        // Gateway is requesting manual approval
        console.log('🔔 PAIRING REQUEST RECEIVED');
        console.log('');
        console.log('   The agent needs to be approved to connect to the gateway.');
        console.log('   Please run this command in another terminal:');
        console.log('');
        console.log('   openclaw devices approve');
        console.log('');
        console.log('   Waiting for approval...');
        break;

      case 'pairing.approved':
        // Pairing was approved!
        console.log('✅ PAIRING APPROVED!');
        console.log('   Agent is now authorized to communicate with the gateway');
        if (message.payload?.deviceToken) {
          console.log(`   Device token: ${message.payload.deviceToken.slice(0, 16)}...`);
        }
        break;

      case 'pairing.rejected':
        console.log('❌ PAIRING REJECTED');
        console.log('   The pairing request was denied');
        break;

      case 'agent.delegation':
      case 'delegation_update':
        // Handle new delegation from dashboard
        console.log('📋 New delegation received from dashboard');
        handleDelegationUpdate(message.payload || message.data);
        break;

      case 'agent.stop':
      case 'stop_agent':
        // User requested to stop the agent
        console.log('🛑 Stop command received from gateway');
        stopAgentMonitoring();
        break;

      default:
        // Log but don't error on unknown events
        console.log(`   Event payload:`, message.payload);
        break;
    }
    return;
  }

  // Handle request messages (if gateway sends any to us)
  if (messageType === 'req') {
    console.log(`📥 Request received: method=${message.method}, id=${message.id}`);

    // Respond to ping
    if (message.method === 'ping') {
      sendResponse(message.id, true, { pong: true });
    }
    return;
  }

  console.log('⚠️  Unknown message type:', messageType);
  console.log('   Full message:', message);
}

/**
 * Send a response message to the gateway
 */
function sendResponse(requestId: string, success: boolean, result?: any) {
  if (gatewayConnection && gatewayConnection.readyState === WebSocket.OPEN) {
    const response = {
      type: 'res',
      id: requestId,
      success,
      result,
    };
    console.log(`📤 Sending response: id=${requestId}`);
    gatewayConnection.send(JSON.stringify(response));
  }
}

/**
 * Send event to OpenClaw Gateway
 */
function sendToGateway(eventName: string, payload: any) {
  if (gatewayConnection && gatewayConnection.readyState === WebSocket.OPEN) {
    const message = {
      type: 'event',
      event: `agent.${eventName}`,
      payload: {
        ...payload,
        timestamp: new Date().toISOString(),
      },
    };
    console.log(`📤 Sending event to gateway: agent.${eventName}`);
    gatewayConnection.send(JSON.stringify(message));
  } else {
    console.warn(`⚠️  Gateway not connected (state: ${gatewayConnection?.readyState || 'null'}), cannot send ${eventName}`);
  }
}

/**
 * Watch the delegation folder for new files
 */
function watchDelegationFolder() {
  console.log(`👀 Watching folder: ${DELEGATION_FOLDER}`);

  // Ensure folder exists
  if (!existsSync(DELEGATION_FOLDER)) {
    console.error(`❌ Delegation folder does not exist: ${DELEGATION_FOLDER}`);
    console.error('   Please create it first or check the path');
    process.exit(1);
  }

  // Check for existing delegation files on startup
  checkForExistingDelegations();

  // Watch for new files
  watch(DELEGATION_FOLDER, { persistent: true }, (eventType, filename) => {
    if (eventType === 'rename' && filename) {
      console.log(`📁 File change detected: ${filename}`);

      const filePath = join(DELEGATION_FOLDER, filename);

      // Check if it's a new delegation file
      if (existsSync(filePath) && filename.endsWith('.json')) {
        console.log(`📄 New delegation file detected: ${filename}`);
        processDelegationFile(filePath);
      }
    }
  });
}

/**
 * Check for existing delegation files on startup
 */
function checkForExistingDelegations() {
  try {
    const files = readdirSync(DELEGATION_FOLDER);
    const jsonFiles = files.filter((f) => f.endsWith('.json'));

    if (jsonFiles.length === 0) {
      console.log('📭 No existing delegation files found');
      return;
    }

    console.log(`📬 Found ${jsonFiles.length} existing delegation file(s)`);

    // Sort by modification time, get most recent
    const sortedFiles = jsonFiles
      .map((f) => ({
        name: f,
        path: join(DELEGATION_FOLDER, f),
        mtime: statSync(join(DELEGATION_FOLDER, f)).mtime,
      }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    const mostRecent = sortedFiles[0];
    console.log(`📄 Loading most recent delegation: ${mostRecent.name}`);
    processDelegationFile(mostRecent.path);
  } catch (error) {
    console.error('❌ Error checking for existing delegations:', error);
  }
}

/**
 * Process a delegation file
 */
function processDelegationFile(filePath: string) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(content);

    // Handle both single delegation object and array format
    let delegation;
    if (Array.isArray(parsed)) {
      // If it's an array, take the most recent active delegation
      const activeDelegations = parsed.filter((d) => d.status === 'active');
      if (activeDelegations.length === 0) {
        console.log('⚠️  No active delegations found in file');
        return;
      }
      // Sort by timestamp, get most recent
      delegation = activeDelegations.sort((a, b) => b.timestamp - a.timestamp)[0];
      console.log(`   Using most recent delegation from ${new Date(delegation.timestamp).toLocaleString()}`);
    } else {
      delegation = parsed;
    }

    handleDelegationUpdate(delegation);
  } catch (error) {
    console.error(`❌ Failed to process delegation file ${filePath}:`, error);
  }
}

/**
 * Handle delegation update (from file or gateway)
 */
async function handleDelegationUpdate(delegation: any) {
  console.log('📋 Processing delegation...');
  console.log(`   Smart Account: ${delegation.smartAccountAddress}`);
  console.log(`   Risk Profile: ${delegation.riskProfile}`);
  console.log(`   Session Key: ${delegation.sessionKey?.slice(0, 10)}...${delegation.sessionKey?.slice(-4)}`);

  // Validate delegation
  if (!delegation.smartAccountAddress || !delegation.sessionKey) {
    console.error('❌ Invalid delegation: missing required fields');
    return;
  }

  // Update environment variables
  process.env.AGENT_WALLET_ADDRESS = delegation.smartAccountAddress;
  process.env.SESSION_PRIVATE_KEY = delegation.sessionKey;
  process.env.RISK_PROFILE = delegation.riskProfile || 'low';

  // Store current delegation
  currentDelegation = {
    smartAccountAddress: delegation.smartAccountAddress as Address,
    sessionKey: delegation.sessionKey,
    riskProfile: (delegation.riskProfile || 'low') as 'low' | 'medium' | 'high',
  };

  // Initialize and start the agent
  try {
    await initializeAgent(
      currentDelegation.smartAccountAddress,
      currentDelegation.riskProfile
    );

    console.log('✅ Agent initialized successfully');

    // Start monitoring if not already running
    if (!isAgentRunning) {
      startAgentMonitoring();
    }

    // Notify gateway
    sendToGateway('agent_started', {
      smartAccountAddress: currentDelegation.smartAccountAddress,
      riskProfile: currentDelegation.riskProfile,
      status: 'running',
    });
  } catch (error) {
    console.error('❌ Failed to initialize agent:', error);
    sendToGateway('agent_error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Start autonomous monitoring loop
 */
function startAgentMonitoring() {
  if (isAgentRunning) {
    console.log('⚠️  Agent is already running');
    return;
  }

  console.log('\n🤖 Starting autonomous monitoring...');
  console.log(`   Check interval: ${CHECK_INTERVAL / 1000 / 60} minutes`);
  console.log('');

  isAgentRunning = true;

  // Run first scan immediately
  runScan();

  // Then run on interval
  setInterval(() => {
    runScan();
  }, CHECK_INTERVAL);
}

/**
 * Stop autonomous monitoring
 */
function stopAgentMonitoring() {
  console.log('🛑 Stopping agent monitoring...');
  isAgentRunning = false;

  sendToGateway('agent_stopped', {
    timestamp: new Date().toISOString(),
  });
}

/**
 * Run a single scan cycle
 */
async function runScan() {
  if (!isAgentRunning) return;

  const timestamp = new Date().toISOString();
  console.log(`\n[${timestamp}] 🔍 Running autonomous scan...`);

  // Notify gateway that scan is starting
  sendToGateway('scan_started', {
    timestamp,
  });

  try {
    const result = await scanAndOptimize();

    console.log(`   Result: ${result.action} - ${result.details}`);

    if (result.txHash) {
      console.log(`   Transaction: https://bscscan.com/tx/${result.txHash}`);
    }

    // Notify gateway of scan results
    sendToGateway('scan_completed', {
      timestamp,
      action: result.action,
      details: result.details,
      txHash: result.txHash,
    });

  } catch (error) {
    console.error('❌ Error during scan:', error);

    sendToGateway('scan_error', {
      timestamp,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  console.log(`\n⏳ Next scan in ${CHECK_INTERVAL / 1000 / 60} minutes...`);
  console.log('─'.repeat(60));
}

/**
 * Main startup function
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                  FlowCap Agent Starting                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  // Load soul.md
  const soulPrompt = loadSoulPrompt();
  console.log(`📖 Loaded soul.md (${soulPrompt.length} characters)`);
  console.log('');

  // Connect to OpenClaw Gateway
  try {
    await connectToGateway();
  } catch (error) {
    console.error('❌ Failed to connect to OpenClaw Gateway');
    console.error('   Continuing anyway, will watch for delegation files...');
  }

  // Start watching delegation folder
  watchDelegationFolder();

  console.log('');
  console.log('✅ FlowCap Agent is ready');
  console.log('');
  console.log('💡 Next steps:');
  console.log('   1. Open the FlowCap dashboard in your browser');
  console.log('   2. Connect your wallet and delegate a session key');
  console.log('   3. The agent will automatically detect the delegation and start monitoring');
  console.log('');
  console.log('Press Ctrl+C to stop the agent');
  console.log('─'.repeat(60));
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down gracefully...');

  if (gatewayConnection) {
    gatewayConnection.close();
  }

  process.exit(0);
});

// Start the agent
main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
