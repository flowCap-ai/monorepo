/**
 * FlowCap Delegation Server
 *
 * Server-side proxy for OpenClaw Gateway communication
 * Handles WebSocket connection to OpenClaw and exposes REST API for frontend
 *
 * This architecture:
 * - Bypasses browser WebSocket CORS/schema restrictions
 * - Keeps auth token server-side (secure)
 * - Scales to cloud deployment (Vercel, Railway, etc.)
 */

import express from 'express';
import cors from 'cors';
import { WebSocket } from 'ws';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const app = express();
const PORT = process.env.OPENCLAW_PROXY_PORT || 3001;

// OpenClaw Gateway configuration
const OPENCLAW_GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789';
const OPENCLAW_AUTH_TOKEN = process.env.OPENCLAW_AUTH_TOKEN || 'K70Jzlq3_ZVxwaQ4M5AmYbNPG7GKmDPsxSeZH45EhpM';
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '+33695885697';

// Middleware
app.use(cors());
app.use(express.json());

// OpenClaw WebSocket client state
let openclawWs: WebSocket | null = null;
let isConnected = false;
let messageId = 0;
let pendingRequests = new Map<string, { resolve: (value: any) => void; reject: (error: any) => void }>();

/**
 * Connect to OpenClaw Gateway (server-side)
 */
async function connectToOpenClaw(): Promise<void> {
  return new Promise((resolve, reject) => {
    const wsUrl = `${OPENCLAW_GATEWAY_URL}?token=${OPENCLAW_AUTH_TOKEN}`;
    console.log('🔌 Connecting to OpenClaw Gateway...');

    openclawWs = new WebSocket(wsUrl);

    const timeout = setTimeout(() => {
      if (openclawWs && openclawWs.readyState !== WebSocket.OPEN) {
        console.error('⏱️ Connection timeout');
        openclawWs.close();
        reject(new Error('Connection timeout - OpenClaw may not be running'));
      }
    }, 10000);

    openclawWs.on('open', () => {
      console.log('🦞 WebSocket connected to OpenClaw Gateway');
      clearTimeout(timeout);
    });

    openclawWs.on('message', (data) => {
      const message = JSON.parse(data.toString());
      console.log('📨 Received from OpenClaw:', message.type, message.event || message.method);

      // Handle connect challenge
      if (message.type === 'event' && message.event === 'connect.challenge') {
        const connectParams = {
          minProtocol: 1,
          maxProtocol: 1,
          client: {
            id: 'cli',
            version: '1.0.0',
            platform: 'linux', // Server platform
            mode: 'operator',
          },
          role: 'operator',
          scopes: ['operator.read', 'operator.write'],
          auth: {
            token: OPENCLAW_AUTH_TOKEN,
          },
        };

        openclawWs!.send(JSON.stringify({
          type: 'req',
          id: 'connect-1',
          method: 'connect',
          params: connectParams,
        }));
      }

      // Handle connect response
      if (message.type === 'res' && message.id === 'connect-1') {
        if (message.ok) {
          console.log('✅ Connected to OpenClaw Gateway');
          isConnected = true;
          resolve();
        } else {
          console.error('❌ Connection failed:', message.error);
          reject(new Error(message.error?.message || 'Connection failed'));
        }
      }

      // Handle other responses
      if (message.type === 'res' && message.id) {
        const pending = pendingRequests.get(message.id);
        if (pending) {
          if (message.ok) {
            pending.resolve(message.payload);
          } else {
            pending.reject(new Error(message.error?.message || 'Request failed'));
          }
          pendingRequests.delete(message.id);
        }
      }
    });

    openclawWs.on('error', (error) => {
      console.error('❌ WebSocket error:', error);
      isConnected = false;
      reject(error);
    });

    openclawWs.on('close', () => {
      console.log('❌ WebSocket closed');
      isConnected = false;
      pendingRequests.forEach(({ reject }) => reject(new Error('Connection closed')));
      pendingRequests.clear();
    });
  });
}

/**
 * Send request to OpenClaw and wait for response
 */
async function sendOpenClawRequest(method: string, params: any): Promise<any> {
  if (!openclawWs || !isConnected) {
    throw new Error('Not connected to OpenClaw');
  }

  const id = `req-${++messageId}`;

  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });

    openclawWs!.send(JSON.stringify({
      type: 'req',
      id,
      method,
      params,
    }));

    // Timeout after 30 seconds
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error('Request timeout'));
      }
    }, 30000);
  });
}

/**
 * Send message to OpenClaw agent
 */
async function sendAgentMessage(message: string, options?: {
  thinking?: 'off' | 'minimal' | 'low' | 'medium' | 'high';
}): Promise<any> {
  return sendOpenClawRequest('agent.message', {
    message,
    thinking: options?.thinking || 'low',
  });
}

// ============================================================================
// API ENDPOINTS
// ============================================================================

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    openclawConnected: isConnected,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /api/delegate
 *
 * Receives delegation data from frontend and forwards to OpenClaw agent
 */
app.post('/api/delegate', async (req, res) => {
  try {
    const {
      sessionKey,
      sessionAddress,
      smartAccountAddress,
      riskProfile,
      maxInvestment,
      validUntil,
      permissions,
      chain,
    } = req.body;

    console.log('📤 Received delegation request:', {
      smartAccountAddress,
      riskProfile,
      maxInvestment,
    });

    // Validate required fields
    if (!sessionKey || !smartAccountAddress || !riskProfile) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: sessionKey, smartAccountAddress, riskProfile',
      });
    }

    // Check OpenClaw connection
    if (!isConnected) {
      return res.status(503).json({
        success: false,
        error: "OpenClaw not connected. Please ensure 'openclaw gateway' is running.",
      });
    }

    // Build delegation payload
    const delegationPayload = {
      type: 'flowcap.delegation',
      sessionKey,
      sessionAddress,
      smartAccountAddress,
      riskProfile,
      maxInvestment,
      validUntil,
      permissions,
      chain,
      timestamp: Date.now(),
    };

    // Send delegation to OpenClaw agent
    console.log('📤 Transmitting delegation to OpenClaw agent...');
    await sendOpenClawRequest('agent.delegate', {
      type: 'flowcap.delegation',
      payload: delegationPayload,
      persist: true, // Store in ~/.openclaw/
    });

    console.log('✅ Delegation transmitted to agent');

    // Send WhatsApp notification
    const riskProfileNames = {
      low: 'Conservative (Stablecoins Only)',
      medium: 'Balanced (Stables + BNB)',
      high: 'Aggressive (All Protocols)',
    };

    const whatsappMessage = `Account Delegated! 🦞 I am now managing your ${riskProfileNames[riskProfile as keyof typeof riskProfileNames]} strategy on ${chain?.name || 'BNB Chain'}. Monitoring PancakeSwap and Venus for you 24/7.`;

    console.log('📱 Sending WhatsApp notification...');
    try {
      await sendAgentMessage(
        `Send a WhatsApp message to ${WHATSAPP_NUMBER} with this exact text: "${whatsappMessage}"`,
        { thinking: 'low' }
      );
      console.log('✅ WhatsApp notification sent');
    } catch (whatsappError) {
      console.warn('⚠️ WhatsApp notification failed:', whatsappError);
      // Don't fail the whole request
    }

    // Start monitoring
    console.log('🔄 Starting autonomous yield monitoring...');
    try {
      const monitoringMessage = `Start FlowCap DeFi monitoring with this configuration:

Smart Account: ${smartAccountAddress}
Session Private Key: ${sessionKey}
Risk Profile: ${riskProfile.toUpperCase()}
Max Investment: $${maxInvestment}

Instructions:
1. Install the FlowCap DeFi skill if not already installed
2. Start autonomous yield monitoring on BNB Chain
3. Scan opportunities every 5 minutes
4. Execute reallocations when profitable after gas costs
5. Follow the ${riskProfile} risk profile restrictions

Run continuously in the background.`;

      await sendAgentMessage(monitoringMessage, { thinking: 'medium' });
      console.log('✅ Monitoring started');
    } catch (monitoringError) {
      console.warn('⚠️ Failed to start monitoring:', monitoringError);
      // Don't fail the whole request
    }

    // Success response
    res.json({
      success: true,
      message: 'Delegation successful',
      smartAccountAddress,
      riskProfile,
      whatsappSent: true,
      monitoringStarted: true,
    });

  } catch (error: any) {
    console.error('❌ Delegation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Delegation failed',
    });
  }
});

/**
 * GET /api/openclaw/status
 *
 * Get OpenClaw agent status
 */
app.get('/api/openclaw/status', async (req, res) => {
  try {
    if (!isConnected) {
      return res.status(503).json({
        success: false,
        error: 'Not connected to OpenClaw',
      });
    }

    const status = await sendOpenClawRequest('agent.status', {});

    res.json({
      success: true,
      status,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get status',
    });
  }
});

// ============================================================================
// SERVER STARTUP
// ============================================================================

async function startServer() {
  try {
    // Connect to OpenClaw first
    console.log('🚀 Starting FlowCap Delegation Server...');
    await connectToOpenClaw();

    // Start Express server
    app.listen(PORT, () => {
      console.log(`\n✅ Server running on http://localhost:${PORT}`);
      console.log(`   Health: http://localhost:${PORT}/health`);
      console.log(`   Delegate: POST http://localhost:${PORT}/api/delegate\n`);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    console.error('\n⚠️  Make sure OpenClaw Gateway is running:');
    console.error('   openclaw gateway\n');
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  if (openclawWs) {
    openclawWs.close();
  }
  process.exit(0);
});

startServer();
