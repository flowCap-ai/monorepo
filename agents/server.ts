#!/usr/bin/env tsx
/**
 * FlowCap Agent Server
 *
 * Standalone HTTP server (port 3002) that runs the agent in its own process.
 * The dashboard communicates with this server via REST + SSE.
 *
 * Architecture:
 *   Dashboard (Next.js :3000)  ←HTTP/SSE→  Agent Server (:3002)  ←WS→  OpenClaw Gateway (:18789)
 *
 * Endpoints:
 *   GET  /health              — Health check
 *   POST /api/agent/initialize — Initialize agent with delegation
 *   POST /api/agent/scan      — Trigger manual scan
 *   GET  /api/agent/status    — Get agent status
 *   GET  /api/agent/events    — SSE stream for real-time agent events
 *   POST /api/agent/stop      — Stop the agent
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { WebSocket } from 'ws';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Address } from 'viem';
import {
  initializeAgent,
  scanAndOptimize,
  getAgentStatus,
  startAgent,
  stopAgent,
} from './index.js';

// ─── Config ──────────────────────────────────────────────────
const PORT = parseInt(process.env.AGENT_SERVER_PORT || '3002');
const OPENCLAW_GATEWAY_URL = process.env.OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:18789';
const DEVICE_AUTH_PATH = join(homedir(), '.openclaw', 'identity', 'device-auth.json');
const API_SECRET = process.env.FLOWCAP_API_SECRET || '';

// ─── SSE Event Bus ───────────────────────────────────────────
type SSEClient = {
  id: string;
  res: express.Response;
};

const sseClients: SSEClient[] = [];
let eventCounter = 0;

/** Broadcast an event to all connected SSE clients */
export function broadcastEvent(event: string, data: Record<string, unknown>): void {
  eventCounter++;
  const payload = JSON.stringify({ ...data, timestamp: new Date().toISOString() });
  const message = `id: ${eventCounter}\nevent: ${event}\ndata: ${payload}\n\n`;

  // Log event
  console.log(`📡 SSE [${event}] → ${sseClients.length} client(s)`);

  // Send to all clients, remove dead ones
  for (let i = sseClients.length - 1; i >= 0; i--) {
    try {
      sseClients[i].res.write(message);
    } catch {
      sseClients.splice(i, 1);
    }
  }
}

// ─── OpenClaw Gateway Connection ─────────────────────────────
let openclawWs: WebSocket | null = null;
let gatewayConnected = false;

function loadOperatorToken(): string | null {
  try {
    if (!existsSync(DEVICE_AUTH_PATH)) return null;
    const auth = JSON.parse(readFileSync(DEVICE_AUTH_PATH, 'utf-8'));
    return auth.tokens?.operator?.token || null;
  } catch {
    return null;
  }
}

async function connectToOpenClaw(): Promise<boolean> {
  const token = loadOperatorToken();
  if (!token) {
    console.warn('⚠️  No OpenClaw operator token found — running standalone');
    return false;
  }

  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(`${OPENCLAW_GATEWAY_URL}?token=${token}`);
      const timeout = setTimeout(() => {
        ws.close();
        console.warn('⚠️  OpenClaw Gateway connection timeout — running standalone');
        resolve(false);
      }, 8000);

      ws.on('open', () => {
        openclawWs = ws;
      });

      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());

        // Handle challenge
        if (msg.type === 'event' && msg.event === 'connect.challenge') {
          ws.send(JSON.stringify({
            type: 'req',
            id: 'connect-1',
            method: 'connect',
            params: {
              minProtocol: 3,
              maxProtocol: 3,
              client: { id: 'gateway-client', version: '1.0.0', platform: 'server', mode: 'backend' },
              role: 'operator',
              scopes: ['operator.read', 'operator.write'],
              auth: { token },
            },
          }));
        }

        // Handle connect response
        if (msg.type === 'res' && msg.id === 'connect-1') {
          clearTimeout(timeout);
          if (msg.ok) {
            gatewayConnected = true;
            console.log('🦞 Connected to OpenClaw Gateway');
            broadcastEvent('gateway_connected', { gateway: OPENCLAW_GATEWAY_URL });
            resolve(true);
          } else {
            console.warn('⚠️  OpenClaw auth failed:', msg.error?.message);
            resolve(false);
          }
        }

        // Forward gateway events to SSE
        if (msg.type === 'event' && msg.event !== 'connect.challenge') {
          broadcastEvent(`openclaw.${msg.event}`, msg.payload || {});
        }
      });

      ws.on('error', () => {
        clearTimeout(timeout);
        console.warn('⚠️  OpenClaw Gateway not reachable — running standalone');
        resolve(false);
      });

      ws.on('close', () => {
        gatewayConnected = false;
        openclawWs = null;
        broadcastEvent('gateway_disconnected', {});
        // Auto-reconnect after 10s
        setTimeout(() => connectToOpenClaw(), 10000);
      });
    } catch {
      resolve(false);
    }
  });
}

/** Send a message to OpenClaw Gateway */
function sendToGateway(method: string, params: Record<string, unknown>): void {
  if (openclawWs && openclawWs.readyState === WebSocket.OPEN) {
    openclawWs.send(JSON.stringify({ type: 'req', id: `req-${Date.now()}`, method, params }));
  }
}

// ─── Middleware ───────────────────────────────────────────────
const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// Optional API key auth
function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (API_SECRET) {
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${API_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized', success: false });
    }
  }
  next();
}

// ─── Routes ──────────────────────────────────────────────────

/** Health check */
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    agent: getAgentStatus(),
    openclawGateway: gatewayConnected,
    sseClients: sseClients.length,
    uptime: process.uptime(),
  });
});

/**
 * Self-registration — Agent announces itself to a remote dashboard.
 * Called manually or on startup:
 *   POST /api/agent/register { dashboardUrl, walletAddress }
 */
app.post('/api/agent/register', authMiddleware, async (req, res) => {
  try {
    const { dashboardUrl, walletAddress } = req.body;
    if (!dashboardUrl || !walletAddress) {
      return res.status(400).json({ error: 'dashboardUrl and walletAddress required', success: false });
    }

    // Determine our own public URL (user must pass it or we use env)
    const selfUrl = req.body.agentUrl || process.env.AGENT_PUBLIC_URL || `http://localhost:${PORT}`;

    const regRes = await fetch(`${dashboardUrl}/api/agent-registry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        walletAddress,
        agentUrl: selfUrl,
        apiSecret: API_SECRET,
      }),
    });

    if (!regRes.ok) {
      const data = await regRes.json();
      return res.status(502).json({ error: data.error || 'Registration failed', success: false });
    }

    const data = await regRes.json();
    broadcastEvent('agent_registered', { dashboardUrl, walletAddress });

    res.json({ success: true, registration: data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Registration failed';
    res.status(500).json({ error: msg, success: false });
  }
});

/** SSE — real-time agent events stream */
app.get('/api/agent/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable nginx buffering
  });

  // Send initial status
  const initData = JSON.stringify({ ...getAgentStatus(), openclawGateway: gatewayConnected });
  res.write(`event: connected\ndata: ${initData}\n\n`);

  const clientId = `sse-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  sseClients.push({ id: clientId, res });
  console.log(`📡 SSE client connected: ${clientId} (total: ${sseClients.length})`);

  // Heartbeat every 30s
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    const idx = sseClients.findIndex(c => c.id === clientId);
    if (idx !== -1) sseClients.splice(idx, 1);
    console.log(`📡 SSE client disconnected: ${clientId} (total: ${sseClients.length})`);
  });
});

/** Initialize agent */
app.post('/api/agent/initialize', authMiddleware, async (req, res) => {
  try {
    const { smartAccountAddress, riskProfile } = req.body;

    if (!smartAccountAddress || !/^0x[0-9a-fA-F]{40}$/.test(smartAccountAddress)) {
      return res.status(400).json({ error: 'Invalid smartAccountAddress', success: false });
    }
    if (!['low', 'medium', 'high'].includes(riskProfile)) {
      return res.status(400).json({ error: 'Invalid riskProfile', success: false });
    }

    await initializeAgent(smartAccountAddress as Address, riskProfile);

    broadcastEvent('agent_initialized', { smartAccountAddress, riskProfile });

    // Notify OpenClaw Gateway
    sendToGateway('agent.initialized', { smartAccountAddress, riskProfile });

    res.json({ success: true, message: 'Agent initialized' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Initialization failed';
    broadcastEvent('agent_error', { error: msg });
    res.status(500).json({ error: msg, success: false });
  }
});

/** Trigger a manual scan */
app.post('/api/agent/scan', authMiddleware, async (req, res) => {
  try {
    broadcastEvent('scan_started', {});

    const result = await scanAndOptimize();

    broadcastEvent('scan_completed', {
      action: result.action,
      details: result.details,
      txHash: result.txHash,
    });

    // Notify OpenClaw
    sendToGateway('agent.scan_completed', { ...result });

    res.json({ success: true, result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Scan failed';
    broadcastEvent('scan_error', { error: msg });
    res.status(500).json({ error: msg, success: false });
  }
});

/** Get agent status */
app.get('/api/agent/status', (req, res) => {
  res.json({
    success: true,
    status: getAgentStatus(),
    openclawGateway: gatewayConnected,
  });
});

/** Start autonomous monitoring */
app.post('/api/agent/start', authMiddleware, async (req, res) => {
  try {
    broadcastEvent('agent_starting', {});

    // Start in background — don't block the HTTP response
    startAgent().catch(err => {
      broadcastEvent('agent_error', { error: err.message });
    });

    res.json({ success: true, message: 'Agent monitoring started' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Start failed';
    res.status(500).json({ error: msg, success: false });
  }
});

/** Stop agent */
app.post('/api/agent/stop', authMiddleware, (req, res) => {
  stopAgent();
  broadcastEvent('agent_stopped', {});
  sendToGateway('agent.stopped', {});
  res.json({ success: true, message: 'Agent stopped' });
});

// ─── Server Startup ──────────────────────────────────────────
async function start() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║           FlowCap Agent Server Starting               ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  // Try connecting to OpenClaw Gateway (non-blocking)
  await connectToOpenClaw();

  app.listen(PORT, () => {
    console.log(`\n✅ Agent Server running on http://localhost:${PORT}`);
    console.log(`   Health:     GET  http://localhost:${PORT}/health`);
    console.log(`   Status:     GET  http://localhost:${PORT}/api/agent/status`);
    console.log(`   Events:     GET  http://localhost:${PORT}/api/agent/events  (SSE)`);
    console.log(`   Initialize: POST http://localhost:${PORT}/api/agent/initialize`);
    console.log(`   Scan:       POST http://localhost:${PORT}/api/agent/scan`);
    console.log(`   Start:      POST http://localhost:${PORT}/api/agent/start`);
    console.log(`   Stop:       POST http://localhost:${PORT}/api/agent/stop`);
    console.log(`\n   OpenClaw Gateway: ${gatewayConnected ? '🟢 Connected' : '🔴 Not connected (standalone mode)'}`);
    console.log('─'.repeat(56));
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  stopAgent();
  if (openclawWs) openclawWs.close();
  process.exit(0);
});

start().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
