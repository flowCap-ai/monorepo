/**
 * Agent Events — Polling Proxy
 *
 * Polls events from a user's remote agent server and returns them as JSON.
 * Works on Vercel serverless (no long-lived SSE connections).
 *
 * Flow:
 *   Browser → GET /api/agent/events?wallet=0x...&since=<lastEventId>
 *   Dashboard → GET agentUrl/api/agent/events/poll?since=<id>
 *   Returns JSON { events[], lastEventId, status }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAgent } from '../../../../lib/agentRegistry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get('wallet');
  const since = request.nextUrl.searchParams.get('since') || '0';

  if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return NextResponse.json(
      { error: 'wallet query parameter required', success: false },
      { status: 400 },
    );
  }

  const agent = await getAgent(wallet);

  if (!agent) {
    return NextResponse.json(
      { error: 'No agent registered. Connect your agent first.', success: false },
      { status: 404 },
    );
  }

  // ─── Poll events from remote agent ─────────────────────────

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (agent.apiSecret) {
    headers['Authorization'] = `Bearer ${agent.apiSecret}`;
  }

  try {
    const agentRes = await fetch(
      `${agent.agentUrl}/api/agent/events/poll?since=${encodeURIComponent(since)}`,
      { headers, cache: 'no-store' },
    );

    if (!agentRes.ok) {
      return NextResponse.json(
        { error: `Agent server returned ${agentRes.status}`, success: false },
        { status: 502 },
      );
    }

    const data = await agentRes.json();
    return NextResponse.json({ success: true, ...data });
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Cannot reach agent server. Is it running?',
        details: err instanceof Error ? err.message : 'Connection failed',
        success: false,
      },
      { status: 502 },
    );
  }
}
