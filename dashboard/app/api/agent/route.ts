/**
 * OpenClaw Agent API Route — Multi-tenant Proxy (SaaS)
 *
 * Routes requests to the correct user's agent server based on their
 * wallet address. The agent URL is resolved via the Agent Registry.
 *
 * Architecture:
 *   Browser → POST /api/agent { wallet, action, ... }
 *           → Dashboard resolves wallet → agentUrl via Registry
 *           → Proxy to user's agent server (local, VPS, cloud)
 *
 * SECURITY:
 *  - Per-user agent auth via registry apiSecret
 *  - Rate limiting: 20 req/min per IP
 *  - Session private key is NEVER accepted
 *  - Only 'initialize', 'scan', 'status', 'start', 'stop' actions allowed
 */

import { NextRequest, NextResponse } from 'next/server';
import { proxyToAgent as registryProxy, getAgent } from '../../../lib/agentRegistry';

// ─── Config ──────────────────────────────────────────────────
const VALID_ACTIONS = ['initialize', 'scan', 'status', 'start', 'stop'] as const;

// ─── Rate limiter ────────────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; reset: number }>();
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.reset) {
    rateLimitMap.set(ip, { count: 1, reset: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

// ─── Validators ──────────────────────────────────────────────
const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const VALID_RISK_PROFILES = ['low', 'medium', 'high'] as const;

// ─── POST handler ────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    if (isRateLimited(getClientIp(request))) {
      return NextResponse.json(
        { error: 'Too many requests', success: false },
        { status: 429 },
      );
    }

    const body = await request.json();
    const { action, wallet, smartAccountAddress, riskProfile } = body;

    // ── Wallet identification (required for multi-tenant) ──
    const userWallet = wallet || smartAccountAddress;
    if (!userWallet || !ETH_ADDRESS_RE.test(userWallet)) {
      return NextResponse.json(
        { error: 'wallet address is required to identify your agent', success: false },
        { status: 400 },
      );
    }

    // ── Check agent is registered ──────────────────────────
    const agent = getAgent(userWallet);
    if (!agent) {
      return NextResponse.json(
        {
          error: 'No agent connected. Go to Settings to connect your OpenClaw agent.',
          code: 'AGENT_NOT_REGISTERED',
          success: false,
        },
        { status: 404 },
      );
    }

    // ── Action validation ──────────────────────────────────
    if (!action || !VALID_ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: `Invalid action. Allowed: ${VALID_ACTIONS.join(', ')}` },
        { status: 400 },
      );
    }

    // ── SECURITY: Reject private keys ──────────────────────
    if ('sessionPrivateKey' in body) {
      return NextResponse.json(
        { error: 'sessionPrivateKey must not be sent to the server', success: false },
        { status: 400 },
      );
    }

    // ── Route to user's agent server ───────────────────────
    switch (action) {
      case 'initialize': {
        if (!smartAccountAddress || !riskProfile) {
          return NextResponse.json(
            { error: 'Missing smartAccountAddress or riskProfile', success: false },
            { status: 400 },
          );
        }
        if (!VALID_RISK_PROFILES.includes(riskProfile)) {
          return NextResponse.json(
            { error: `Invalid riskProfile. Allowed: ${VALID_RISK_PROFILES.join(', ')}`, success: false },
            { status: 400 },
          );
        }

        const initRes = await registryProxy(userWallet, '/api/agent/initialize', 'POST', {
          smartAccountAddress,
          riskProfile,
        });
        const initData = await initRes.json();
        return NextResponse.json(initData, { status: initRes.status });
      }

      case 'scan': {
        const scanRes = await registryProxy(userWallet, '/api/agent/scan', 'POST');
        const scanData = await scanRes.json();
        return NextResponse.json(scanData, { status: scanRes.status });
      }

      case 'status': {
        const statusRes = await registryProxy(userWallet, '/api/agent/status');
        const statusData = await statusRes.json();
        return NextResponse.json(statusData, { status: statusRes.status });
      }

      case 'start': {
        const startRes = await registryProxy(userWallet, '/api/agent/start', 'POST');
        const startData = await startRes.json();
        return NextResponse.json(startData, { status: startRes.status });
      }

      case 'stop': {
        const stopRes = await registryProxy(userWallet, '/api/agent/stop', 'POST');
        const stopData = await stopRes.json();
        return NextResponse.json(stopData, { status: stopRes.status });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}`, success: false },
          { status: 400 },
        );
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    const isUnreachable = msg.includes('fetch') || msg.includes('abort') || msg.includes('No agent registered');
    console.error('Agent API proxy error:', msg);
    return NextResponse.json(
      { error: isUnreachable ? 'Agent server unreachable. Check your agent connection.' : msg, success: false },
      { status: isUnreachable ? 503 : 500 },
    );
  }
}

// ─── GET handler — requires ?wallet=0x... ────────────────────
export async function GET(request: NextRequest) {
  try {
    if (isRateLimited(getClientIp(request))) {
      return NextResponse.json(
        { error: 'Too many requests', success: false },
        { status: 429 },
      );
    }

    const wallet = request.nextUrl.searchParams.get('wallet');
    if (!wallet || !ETH_ADDRESS_RE.test(wallet)) {
      return NextResponse.json(
        { error: 'wallet query parameter required', success: false },
        { status: 400 },
      );
    }

    const agent = getAgent(wallet);
    if (!agent) {
      return NextResponse.json({
        success: true,
        registered: false,
        status: null,
      });
    }

    try {
      const statusRes = await registryProxy(wallet, '/api/agent/status');
      const statusData = await statusRes.json();
      return NextResponse.json({ ...statusData, registered: true }, { status: statusRes.status });
    } catch {
      return NextResponse.json({
        success: true,
        registered: true,
        status: null,
        agentOffline: true,
      });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error', success: false },
      { status: 500 },
    );
  }
}
