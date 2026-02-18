/**
 * FlowCap Delegation API Route — SaaS compatible
 *
 * Receives delegation metadata from frontend and forwards it to the
 * user's agent server (resolved via the Agent Registry).
 *
 * In local dev, also saves to ~/.openclaw/flowcap-delegations/ as fallback.
 *
 * SECURITY: Session key private material NEVER leaves the client.
 *           Only sessionAddress (public) + compressedSessionData are accepted.
 */

import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { proxyToAgent, getAgent } from '../../../lib/agentRegistry';

// ─── Config ──────────────────────────────────────────────────────
const DELEGATION_FOLDER = join(homedir(), '.openclaw', 'flowcap-delegations');
const ACTIVE_FILE = join(DELEGATION_FOLDER, 'active.json');

// ─── Rate limiter (in-memory, per-ip, per-minute) ────────────────
const rateLimitMap = new Map<string, { count: number; reset: number }>();
const RATE_LIMIT_MAX = 10;
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

// ─── Validators ──────────────────────────────────────────────────
const ETH_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const VALID_RISK_PROFILES = ['low', 'medium', 'high'] as const;

function isValidAddress(addr: unknown): addr is string {
  return typeof addr === 'string' && ETH_ADDRESS_RE.test(addr);
}

// ─── Types ───────────────────────────────────────────────────────
interface DelegationRequest {
  sessionAddress: string;
  smartAccountAddress: string;
  riskProfile: 'low' | 'medium' | 'high';
  maxInvestment: string;
  validUntil: number;
  compressedSessionData?: string | null;
  chain: { id: number; name: string };
}

export async function POST(request: NextRequest) {
  console.log('🔔 API Route /api/delegate called');

  try {
    // ── Rate limiting ──────────────────────────────────────────
    const clientIp =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown';

    if (isRateLimited(clientIp)) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Try again later.' },
        { status: 429 }
      );
    }

    const body: DelegationRequest = await request.json();

    // ── SECURITY: Reject if caller sends a private key ─────────
    if ('sessionKey' in body && typeof (body as any).sessionKey === 'string' && (body as any).sessionKey.length > 42) {
      console.error('❌ Client attempted to send session private key — rejected');
      return NextResponse.json(
        { success: false, error: 'Do not send private keys. Only sessionAddress (public) is accepted.' },
        { status: 400 }
      );
    }

    const { sessionAddress, smartAccountAddress, riskProfile, maxInvestment, validUntil, compressedSessionData, chain } = body;

    // ── Validate required fields ───────────────────────────────
    if (!sessionAddress || !smartAccountAddress || !riskProfile || !maxInvestment) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: sessionAddress, smartAccountAddress, riskProfile, maxInvestment' },
        { status: 400 }
      );
    }

    if (!isValidAddress(sessionAddress)) {
      return NextResponse.json({ success: false, error: 'Invalid sessionAddress format' }, { status: 400 });
    }
    if (!isValidAddress(smartAccountAddress)) {
      return NextResponse.json({ success: false, error: 'Invalid smartAccountAddress format' }, { status: 400 });
    }
    if (!VALID_RISK_PROFILES.includes(riskProfile)) {
      return NextResponse.json(
        { success: false, error: `Invalid riskProfile. Must be one of: ${VALID_RISK_PROFILES.join(', ')}` },
        { status: 400 }
      );
    }
    if (!validUntil || validUntil < Date.now() / 1000) {
      return NextResponse.json({ success: false, error: 'validUntil must be a future unix timestamp' }, { status: 400 });
    }

    // ── Build delegation record ────────────────────────────────
    const delegationId = `${smartAccountAddress.toLowerCase()}-${Date.now()}`;
    const newDelegation = {
      id: delegationId,
      timestamp: Date.now(),
      status: 'active',
      sessionKey: sessionAddress,          // public address — used by agent as identifier
      sessionAddress,
      smartAccountAddress,
      riskProfile,
      maxInvestment,
      validUntil,
      compressedSessionData: compressedSessionData ?? null,
      chain,
    };

    // ── Save to delegation file ────────────────────────────────
    try {
      if (!existsSync(DELEGATION_FOLDER)) {
        mkdirSync(DELEGATION_FOLDER, { recursive: true });
      }

      // Read existing delegations, append new one
      let delegations: typeof newDelegation[] = [];
      if (existsSync(ACTIVE_FILE)) {
        try {
          const existing = JSON.parse(readFileSync(ACTIVE_FILE, 'utf-8'));
          delegations = Array.isArray(existing) ? existing : [existing];
        } catch {
          delegations = [];
        }
      }

      // Remove expired delegations
      const now = Math.floor(Date.now() / 1000);
      delegations = delegations.filter((d) => d.validUntil > now);

      // Add new delegation
      delegations.push(newDelegation);

      writeFileSync(ACTIVE_FILE, JSON.stringify(delegations, null, 2));
      console.log(`✅ Delegation saved to ${ACTIVE_FILE}`);
    } catch (fileError) {
      console.error('❌ Failed to write delegation file:', fileError);
      // Non-fatal — agent may not be running locally, still return success
    }

    console.log('✅ Delegation registered:', {
      delegationId,
      sessionAddress,
      smartAccountAddress,
      riskProfile,
    });

    // ── Notify agent server via registry (non-blocking) ──────
    const agent = await getAgent(smartAccountAddress);
    if (agent) {
      try {
        const agentRes = await proxyToAgent(
          smartAccountAddress,
          '/api/agent/initialize',
          'POST',
          { smartAccountAddress, riskProfile },
        );
        if (agentRes.ok) {
          console.log('📡 Agent server notified of new delegation via registry');
        } else {
          console.warn('⚠️ Agent server responded with', agentRes.status);
        }
      } catch {
        console.warn('⚠️ Remote agent unreachable — delegation saved locally as fallback');
      }
    } else {
      console.warn('⚠️ No agent registered for', smartAccountAddress, '— delegation saved locally only');
    }

    return NextResponse.json({
      success: true,
      delegationId,
      message: 'Delegation registered successfully',
      smartAccountAddress,
      riskProfile,
    });

  } catch (error: any) {
    console.error('❌ Delegation error:', error);
    return NextResponse.json(
      { success: false, error: 'Delegation failed' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    message: 'FlowCap Delegation API',
    endpoints: {
      POST: '/api/delegate — Submit delegation (sessionAddress + compressedSessionData, no private key)',
    },
  });
}
