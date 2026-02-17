/**
 * OpenClaw Agent API Route
 * Connects the dashboard to the real OpenClaw agent
 *
 * SECURITY:
 *  - API key authentication (FLOWCAP_API_SECRET)
 *  - Rate limiting: 20 req/min per IP
 *  - Session private key is NEVER stored in process.env
 *  - Only 'initialize', 'scan', 'status' actions allowed
 */

import { NextRequest, NextResponse } from 'next/server';

// Import the actual OpenClaw agent from /agents
import {
  initializeAgent,
  scanAndOptimize,
  getAgentStatus
} from '../../../../agents/index';

// ─── Auth ────────────────────────────────────────────────────
const API_SECRET = process.env.FLOWCAP_API_SECRET || '';
const VALID_ACTIONS = ['initialize', 'scan', 'status'] as const;

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

export async function POST(request: NextRequest) {
  try {
    // ── Rate limiting ──────────────────────────────────────
    if (isRateLimited(getClientIp(request))) {
      return NextResponse.json(
        { error: 'Too many requests', success: false },
        { status: 429 }
      );
    }

    // ── Optional API key auth ──────────────────────────────
    if (API_SECRET) {
      const authHeader = request.headers.get('authorization');
      if (!authHeader || authHeader !== `Bearer ${API_SECRET}`) {
        return NextResponse.json(
          { error: 'Unauthorized', success: false },
          { status: 401 }
        );
      }
    }

    const body = await request.json();
    const { action, smartAccountAddress, riskProfile } = body;

    // ── Action validation ──────────────────────────────────
    if (!action || !VALID_ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: `Invalid action. Allowed: ${VALID_ACTIONS.join(', ')}` },
        { status: 400 }
      );
    }

    // ── SECURITY: Reject if client sends a private key ─────
    if ('sessionPrivateKey' in body) {
      console.warn('🚫 Client attempted to send sessionPrivateKey via agent API — rejected');
      return NextResponse.json(
        { error: 'sessionPrivateKey must not be sent to the server', success: false },
        { status: 400 }
      );
    }

    switch (action) {
      case 'initialize': {
        if (!smartAccountAddress || !riskProfile) {
          return NextResponse.json(
            { error: 'Missing smartAccountAddress or riskProfile', success: false },
            { status: 400 }
          );
        }

        // Validate address format
        if (!ETH_ADDRESS_RE.test(smartAccountAddress)) {
          return NextResponse.json(
            { error: 'Invalid smartAccountAddress format', success: false },
            { status: 400 }
          );
        }

        // Validate risk profile
        if (!VALID_RISK_PROFILES.includes(riskProfile)) {
          return NextResponse.json(
            { error: `Invalid riskProfile. Allowed: ${VALID_RISK_PROFILES.join(', ')}`, success: false },
            { status: 400 }
          );
        }

        await initializeAgent(smartAccountAddress, riskProfile);

        return NextResponse.json({
          success: true,
          message: 'Agent initialized successfully',
        });
      }

      case 'scan': {
        const scanResult = await scanAndOptimize();
        return NextResponse.json({
          success: true,
          result: scanResult,
        });
      }

      case 'status': {
        const status = getAgentStatus();
        return NextResponse.json({
          success: true,
          status,
        });
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}`, success: false },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Agent API error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Rate limit GET as well
    if (isRateLimited(getClientIp(request))) {
      return NextResponse.json(
        { error: 'Too many requests', success: false },
        { status: 429 }
      );
    }

    const status = getAgentStatus();
    return NextResponse.json({
      success: true,
      status,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
      },
      { status: 500 }
    );
  }
}
