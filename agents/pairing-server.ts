/**
 * OpenClaw Pairing Server
 * WebSocket server that allows dashboard to connect to local agent
 * Users run this on their computer: `openclaw server`
 */

import { WebSocketServer, WebSocket } from 'ws';
import * as readline from 'readline';
import { initializeAgent, scanAndOptimize, getAgentStatus } from './index.js';

interface PairingRequest {
  code: string;
  timestamp: number;
  ws: WebSocket;
  approved: boolean;
}

const pendingPairings = new Map<string, PairingRequest>();
let connectedDashboard: WebSocket | null = null;
let isAgentInitialized = false;

/**
 * Start WebSocket server for dashboard connection
 */
export function startPairingServer(port: number = 3001): void {
  const wss = new WebSocketServer({ port });

  console.log(`\n🚀 OpenClaw Pairing Server running on port ${port}`);
  console.log(`📡 Waiting for dashboard connection...\n`);

  wss.on('connection', (ws: WebSocket) => {
    console.log('🔌 Dashboard connected');

    ws.on('message', async (message: string) => {
      try {
        const data = JSON.parse(message.toString());

        switch (data.type) {
          case 'pairing_request':
            await handlePairingRequest(ws, data.code);
            break;

          case 'start_scan':
            await handleScan(ws);
            break;

          case 'stop_agent':
            // Handle stop
            ws.send(JSON.stringify({
              type: 'agent_stopped',
            }));
            break;

          default:
            console.warn('Unknown message type:', data.type);
        }
      } catch (error) {
        console.error('Error handling message:', error);
        ws.send(JSON.stringify({
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        }));
      }
    });

    ws.on('close', () => {
      console.log('🔌 Dashboard disconnected');
      if (connectedDashboard === ws) {
        connectedDashboard = null;
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  // Start CLI interface for approving pairings
  startCLI();
}

/**
 * Handle pairing request from dashboard
 */
async function handlePairingRequest(ws: WebSocket, code: string): Promise<void> {
  console.log(`\n📨 Pairing request received: ${code}`);
  console.log(`⏰ Waiting for approval...`);
  console.log(`\n💡 To approve, type: approve ${code}\n`);

  // Store pending pairing
  pendingPairings.set(code, {
    code,
    timestamp: Date.now(),
    ws,
    approved: false,
  });
}

/**
 * Approve pairing (called from CLI)
 */
export function approvePairing(code: string): void {
  const pairing = pendingPairings.get(code);

  if (!pairing) {
    console.log(`❌ No pending pairing request for code: ${code}`);
    return;
  }

  // Check if expired (5 minutes)
  const elapsed = Date.now() - pairing.timestamp;
  if (elapsed > 5 * 60 * 1000) {
    console.log(`❌ Pairing code expired (${Math.floor(elapsed / 1000)}s elapsed)`);
    pendingPairings.delete(code);
    pairing.ws.send(JSON.stringify({
      type: 'pairing_rejected',
      reason: 'Code expired',
    }));
    return;
  }

  pairing.approved = true;
  connectedDashboard = pairing.ws;

  // Send approval
  const smartAccountAddress = process.env.USER_SMART_ACCOUNT as `0x${string}`;
  const riskProfile = process.env.RISK_PROFILE || 'low';

  pairing.ws.send(JSON.stringify({
    type: 'pairing_approved',
    agentInfo: {
      version: '1.0.0',
      smartAccountAddress,
      riskProfile,
    },
  }));

  console.log(`✅ Pairing approved: ${code}`);
  console.log(`🔗 Dashboard connected!\n`);

  pendingPairings.delete(code);
}

/**
 * Reject pairing (called from CLI)
 */
export function rejectPairing(code: string): void {
  const pairing = pendingPairings.get(code);

  if (!pairing) {
    console.log(`❌ No pending pairing request for code: ${code}`);
    return;
  }

  pairing.ws.send(JSON.stringify({
    type: 'pairing_rejected',
    reason: 'User rejected',
  }));

  console.log(`❌ Pairing rejected: ${code}`);
  pendingPairings.delete(code);
}

/**
 * Handle scan request from dashboard
 */
async function handleScan(ws: WebSocket): Promise<void> {
  console.log('🔍 Scan requested by dashboard...');

  // Initialize agent if not already done
  if (!isAgentInitialized) {
    const smartAccountAddress = process.env.USER_SMART_ACCOUNT as `0x${string}`;
    const riskProfile = (process.env.RISK_PROFILE || 'low') as 'low' | 'medium' | 'high';

    if (!smartAccountAddress) {
      ws.send(JSON.stringify({
        type: 'error',
        error: 'USER_SMART_ACCOUNT not configured in .env',
      }));
      return;
    }

    await initializeAgent(smartAccountAddress, riskProfile);
    isAgentInitialized = true;
  }

  // Run scan
  const result = await scanAndOptimize();

  // Send result to dashboard
  ws.send(JSON.stringify({
    type: 'scan_result',
    data: result,
  }));

  console.log(`✅ Scan complete: ${result.action} - ${result.details}\n`);
}

/**
 * CLI interface for pairing approval
 */
function startCLI(): void {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'openclaw> ',
  });

  rl.prompt();

  rl.on('line', (line: string) => {
    const [command, ...args] = line.trim().split(' ');

    switch (command) {
      case 'pair':
      case 'approve':
        if (args.length === 0) {
          console.log('Usage: pair <code>  OR  approve <code>');
        } else {
          approvePairing(args[0]);
        }
        break;

      case 'reject':
        if (args.length === 0) {
          console.log('Usage: reject <code>');
        } else {
          rejectPairing(args[0]);
        }
        break;

      case 'status':
        const status = getAgentStatus();
        console.log('\n📊 Agent Status:');
        console.log(`   Running: ${status.isRunning}`);
        console.log(`   Risk Profile: ${status.riskProfile}`);
        console.log(`   Positions: ${status.positionCount}`);
        console.log(`   Last Check: ${status.lastCheck}\n`);
        break;

      case 'pending':
        console.log('\n📋 Pending Pairings:');
        if (pendingPairings.size === 0) {
          console.log('   None\n');
        } else {
          pendingPairings.forEach((pairing, code) => {
            const elapsed = Math.floor((Date.now() - pairing.timestamp) / 1000);
            console.log(`   ${code} (${elapsed}s ago)`);
          });
          console.log();
        }
        break;

      case 'help':
        console.log('\n📖 Available Commands:');
        console.log('   pair <code>     - Approve pairing request (shortcut)');
        console.log('   approve <code>  - Approve pairing request');
        console.log('   reject <code>   - Reject pairing request');
        console.log('   pending         - Show pending pairings');
        console.log('   status          - Show agent status');
        console.log('   help            - Show this help');
        console.log('   exit            - Stop server\n');
        break;

      case 'exit':
        console.log('👋 Shutting down...');
        process.exit(0);
        break;

      default:
        if (line.trim()) {
          console.log(`Unknown command: ${command}. Type 'help' for available commands.`);
        }
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log('\n👋 Goodbye!');
    process.exit(0);
  });
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = process.env.OPENCLAW_PORT ? parseInt(process.env.OPENCLAW_PORT) : 3001;
  startPairingServer(port);
}
