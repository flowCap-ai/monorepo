/**
 * SSE Proxy — Agent Events Stream
 *
 * Proxies SSE events from a user's remote agent server to the browser.
 *
 * Flow:
 *   Browser → GET /api/agent/events?wallet=0x... → Dashboard server
 *   Dashboard server → GET agentUrl/api/agent/events → Agent server
 *   Agent server streams SSE → Dashboard relays → Browser receives
 *
 * This is necessary because the browser cannot directly connect to
 * a user's agent running on their machine or private VPS.
 */

import { NextRequest } from 'next/server';
import { getAgent } from '../../../../lib/agentRegistry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get('wallet');

  if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return new Response(
      `event: error\ndata: ${JSON.stringify({ error: 'wallet query parameter required' })}\n\n`,
      {
        status: 400,
        headers: { 'Content-Type': 'text/event-stream' },
      },
    );
  }

  const agent = await getAgent(wallet);

  if (!agent) {
    return new Response(
      `event: error\ndata: ${JSON.stringify({ error: 'No agent registered. Connect your agent first.' })}\n\n`,
      {
        status: 404,
        headers: { 'Content-Type': 'text/event-stream' },
      },
    );
  }

  // ─── Open SSE connection to remote agent ───────────────────

  const headers: Record<string, string> = {
    Accept: 'text/event-stream',
  };
  if (agent.apiSecret) {
    headers['Authorization'] = `Bearer ${agent.apiSecret}`;
  }

  try {
    const agentRes = await fetch(`${agent.agentUrl}/api/agent/events`, {
      headers,
      // @ts-expect-error - Node fetch supports this for streaming
      cache: 'no-store',
    });

    if (!agentRes.ok || !agentRes.body) {
      return new Response(
        `event: error\ndata: ${JSON.stringify({ error: 'Agent server returned ' + agentRes.status })}\n\n`,
        {
          status: 502,
          headers: { 'Content-Type': 'text/event-stream' },
        },
      );
    }

    // Stream the agent's SSE response directly to the browser
    const stream = new ReadableStream({
      async start(controller) {
        const reader = agentRes.body!.getReader();
        const decoder = new TextDecoder();

        // Send initial proxy connection event
        controller.enqueue(
          new TextEncoder().encode(
            `event: proxy_connected\ndata: ${JSON.stringify({
              agentUrl: agent.agentUrl,
              wallet,
              timestamp: new Date().toISOString(),
            })}\n\n`,
          ),
        );

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              // Agent closed the connection
              controller.enqueue(
                new TextEncoder().encode(
                  `event: proxy_disconnected\ndata: ${JSON.stringify({ reason: 'agent_closed' })}\n\n`,
                ),
              );
              controller.close();
              break;
            }
            // Forward raw SSE data
            controller.enqueue(value);
          }
        } catch (err) {
          controller.enqueue(
            new TextEncoder().encode(
              `event: proxy_error\ndata: ${JSON.stringify({
                error: err instanceof Error ? err.message : 'Stream error',
              })}\n\n`,
            ),
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err) {
    return new Response(
      `event: error\ndata: ${JSON.stringify({
        error: 'Cannot reach agent server. Is it running?',
        details: err instanceof Error ? err.message : 'Connection failed',
      })}\n\n`,
      {
        status: 502,
        headers: { 'Content-Type': 'text/event-stream' },
      },
    );
  }
}
