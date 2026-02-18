/**
 * Agent Registry API Route
 *
 * Allows users to register/unregister their agent server URL.
 * The wallet address is used as the key.
 *
 * POST /api/agent-registry  → Register or update agent URL
 * GET  /api/agent-registry?wallet=0x...  → Get agent status
 * DELETE /api/agent-registry  → Remove agent
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  registerAgent,
  getAgent,
  removeAgent,
  healthCheckAgent,
} from '../../../lib/agentRegistry';

// ─── Rate limiter ────────────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; reset: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.reset) {
    rateLimitMap.set(ip, { count: 1, reset: now + 60_000 });
    return false;
  }
  entry.count++;
  return entry.count > 30;
}

function getIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

// ─── POST: Register agent ────────────────────────────────────
export async function POST(request: NextRequest) {
  if (isRateLimited(getIp(request))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    const body = await request.json();
    const { walletAddress, agentUrl, apiSecret, label } = body;

    if (!walletAddress || !agentUrl) {
      return NextResponse.json(
        { error: 'walletAddress and agentUrl are required', success: false },
        { status: 400 },
      );
    }

    const registration = await registerAgent(walletAddress, agentUrl, apiSecret || '', label);

    // Immediately health check
    const checked = await healthCheckAgent(walletAddress);

    return NextResponse.json({
      success: true,
      agent: checked || registration,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Registration failed', success: false },
      { status: 400 },
    );
  }
}

// ─── GET: Check agent status ─────────────────────────────────
export async function GET(request: NextRequest) {
  if (isRateLimited(getIp(request))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const wallet = request.nextUrl.searchParams.get('wallet');
  if (!wallet) {
    return NextResponse.json(
      { error: 'wallet query parameter required', success: false },
      { status: 400 },
    );
  }

  const agent = await getAgent(wallet);
  if (!agent) {
    return NextResponse.json({
      success: true,
      registered: false,
      agent: null,
    });
  }

  // Run health check
  const checked = await healthCheckAgent(wallet);

  return NextResponse.json({
    success: true,
    registered: true,
    agent: checked ? {
      ...checked,
      // Never expose the apiSecret to the client
      apiSecret: checked.apiSecret ? '••••••••' : '',
    } : null,
  });
}

// ─── DELETE: Remove agent ────────────────────────────────────
export async function DELETE(request: NextRequest) {
  if (isRateLimited(getIp(request))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    const body = await request.json();
    const { walletAddress } = body;

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'walletAddress is required', success: false },
        { status: 400 },
      );
    }

    const removed = await removeAgent(walletAddress);
    return NextResponse.json({ success: true, removed });
  } catch {
    return NextResponse.json(
      { error: 'Failed to remove agent', success: false },
      { status: 500 },
    );
  }
}
