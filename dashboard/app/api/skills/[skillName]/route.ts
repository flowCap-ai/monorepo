/**
 * OpenClaw Skills API Route
 * Exposes individual skills to the dashboard
 *
 * SECURITY:
 *  - Method whitelist: only pre-approved methods can be invoked
 *  - Rate limiting: 30 requests per minute per IP
 *  - Input sanitization: args validated before execution
 */

import { NextRequest, NextResponse } from 'next/server';

// ─── Skill imports ───────────────────────────────────────────
import * as getPoolDataSkill from '../../../../../agents/skills/getPoolData';
import * as analyzePoolSkill from '../../../../../agents/skills/analyzePool';
import * as execSwapSkill from '../../../../../agents/skills/execSwap';

// ─── Skill registry ─────────────────────────────────────────
const skills: Record<string, any> = {
  getPoolData: getPoolDataSkill,
  analyzePool: analyzePoolSkill,
  execSwap: execSwapSkill,
};

// ─── Method whitelist per skill (SECURITY-CRITICAL) ─────────
// Only methods listed here can be invoked via the API.
// Everything else is blocked even if exported by the module.
const ALLOWED_METHODS: Record<string, string[]> = {
  getPoolData: ['getPoolData', 'getMultiplePoolData'],
  analyzePool: ['analyzePool', 'analyzePoolRisk', 'compareYieldOpportunities'],
  execSwap: [
    'getSwapQuote',
    'isSwapProfitable',
    'planReallocation',
    // NOTE: executeSwap, executeReallocation, supplyToVenus, withdrawFromVenus
    // are intentionally NOT whitelisted — they must only be called by the agent
  ],
};

// ─── Rate limiter ────────────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; reset: number }>();
const RATE_LIMIT_MAX = 30;
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

// ─── GET: skill metadata ────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: { skillName: string } }
) {
  try {
    const { skillName } = params;

    if (!skills[skillName]) {
      return NextResponse.json(
        { error: `Skill not found: ${skillName}` },
        { status: 404 }
      );
    }

    // Only expose whitelisted method names
    const allowedMethods = ALLOWED_METHODS[skillName] || [];

    return NextResponse.json({
      success: true,
      skillName,
      methods: allowedMethods,
    });
  } catch (error) {
    console.error('Skill API error:', error);
    return NextResponse.json(
      { error: 'Internal server error', success: false },
      { status: 500 }
    );
  }
}

// ─── POST: execute skill method ─────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: { skillName: string } }
) {
  try {
    // ── Rate limiting ──────────────────────────────────────
    if (isRateLimited(getClientIp(request))) {
      return NextResponse.json(
        { error: 'Too many requests. Try again later.', success: false },
        { status: 429 }
      );
    }

    const { skillName } = params;
    const body = await request.json();
    const { method, args } = body;

    // ── Skill existence ────────────────────────────────────
    if (!skills[skillName]) {
      return NextResponse.json(
        { error: `Skill not found: ${skillName}` },
        { status: 404 }
      );
    }

    // ── Method name validation ─────────────────────────────
    if (!method || typeof method !== 'string') {
      return NextResponse.json(
        { error: 'method parameter is required and must be a string', success: false },
        { status: 400 }
      );
    }

    // ── WHITELIST CHECK (Security-Critical) ────────────────
    const allowed = ALLOWED_METHODS[skillName] || [];
    if (!allowed.includes(method)) {
      console.warn(`🚫 Blocked non-whitelisted method call: ${skillName}.${method}`);
      return NextResponse.json(
        { error: `Method not allowed: ${method}`, success: false },
        { status: 403 }
      );
    }

    // ── Method existence check ─────────────────────────────
    const skill = skills[skillName];
    if (typeof skill[method] !== 'function') {
      return NextResponse.json(
        { error: `Method not found: ${method}`, success: false },
        { status: 404 }
      );
    }

    // ── Args validation ────────────────────────────────────
    const safeArgs = Array.isArray(args) ? args : [];

    // Limit number of arguments to prevent abuse
    if (safeArgs.length > 10) {
      return NextResponse.json(
        { error: 'Too many arguments (max 10)', success: false },
        { status: 400 }
      );
    }

    // ── Execute ────────────────────────────────────────────
    const result = await skill[method](...safeArgs);

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error('Skill execution error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
      },
      { status: 500 }
    );
  }
}
