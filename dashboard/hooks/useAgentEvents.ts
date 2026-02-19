'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// ─── Types ───────────────────────────────────────────────────

export interface AgentEvent {
  id: number;
  event: string;
  data: Record<string, unknown>;
  receivedAt: Date;
}

export interface AgentStatus {
  isRunning: boolean;
  lastCheck: string | null;
  riskProfile: string;
  positionCount: number;
  openclawGateway: boolean;
}

export interface AgentConnection {
  registered: boolean;
  status: 'online' | 'offline' | 'unknown';
  agentUrl?: string;
  lastHealthCheck?: number;
}

export interface UseAgentEventsReturn {
  /** Whether SSE connection is active */
  connected: boolean;
  /** Agent registration/connection info */
  connection: AgentConnection;
  /** Current agent status */
  status: AgentStatus | null;
  /** Recent events (last 50) */
  events: AgentEvent[];
  /** Last scan result */
  lastScan: { action: string; details: string; txHash?: string } | null;
  /** Last error */
  lastError: string | null;
  /** Register an agent server URL */
  connectAgent: (agentUrl: string, apiSecret?: string) => Promise<void>;
  /** Disconnect agent */
  disconnectAgent: () => Promise<void>;
  /** Trigger a manual scan */
  triggerScan: () => Promise<void>;
  /** Start autonomous monitoring */
  startAgent: (smartAccountAddress: string, riskProfile: string) => Promise<void>;
  /** Stop agent */
  stopAgent: () => Promise<void>;
  /** Clear events */
  clearEvents: () => void;
}

// ─── Config ──────────────────────────────────────────────────
// All requests go through the dashboard's API routes (SaaS proxy)
// No more direct browser→agent connection
const MAX_EVENTS = 50;

// ─── Hook ────────────────────────────────────────────────────

export function useAgentEvents(walletAddress?: string): UseAgentEventsReturn {
  const [connected, setConnected] = useState(false);
  const [connection, setConnection] = useState<AgentConnection>({
    registered: false,
    status: 'unknown',
  });
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [lastScan, setLastScan] = useState<UseAgentEventsReturn['lastScan']>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const eventIdRef = useRef(0);

  const wallet = walletAddress?.toLowerCase();

  // Helper: add event to list
  const addEvent = useCallback((event: string, data: Record<string, unknown>) => {
    eventIdRef.current++;
    setEvents(prev => [
      { id: eventIdRef.current, event, data, receivedAt: new Date() },
      ...prev.slice(0, MAX_EVENTS - 1),
    ]);
  }, []);

  // ─── Check agent registration on wallet change ──────────
  useEffect(() => {
    if (!wallet) {
      setConnection({ registered: false, status: 'unknown' });
      return;
    }

    async function checkRegistration() {
      try {
        const res = await fetch(`/api/agent-registry?wallet=${wallet}`);
        const data = await res.json();
        if (data.success && data.registered) {
          setConnection({
            registered: true,
            status: data.agent?.status || 'unknown',
            agentUrl: data.agent?.agentUrl,
            lastHealthCheck: data.agent?.lastHealthCheck,
          });
        } else {
          setConnection({ registered: false, status: 'unknown' });
        }
      } catch {
        setConnection({ registered: false, status: 'unknown' });
      }
    }

    checkRegistration();
  }, [wallet]);

  // ─── Poll events via dashboard proxy (Vercel-compatible) ──
  const lastEventIdRef = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined' || !wallet || !connection.registered) return;

    let active = true;

    async function poll() {
      try {
        const res = await fetch(
          `/api/agent/events?wallet=${wallet}&since=${lastEventIdRef.current}`,
        );
        if (!res.ok) {
          setConnected(false);
          if (res.status === 404) {
            setConnection(prev => ({ ...prev, status: 'offline' }));
          }
          return;
        }

        const data = await res.json();
        if (!data.success) return;

        setConnected(true);
        setConnection(prev => ({ ...prev, status: 'online' }));

        // Update status from poll response
        if (data.status) setStatus(data.status);

        // Track last event ID for next poll
        if (data.lastEventId) lastEventIdRef.current = data.lastEventId;

        // Process new events
        if (Array.isArray(data.events)) {
          for (const evt of data.events) {
            addEvent(evt.event, evt.data);

            // Handle specific event types
            if (evt.event === 'scan_completed') {
              setLastScan({ action: evt.data.action, details: evt.data.details, txHash: evt.data.txHash });
              setLastError(null);
            } else if (evt.event === 'scan_error' || evt.event === 'agent_error') {
              setLastError(evt.data.error as string);
            } else if (evt.event === 'gateway_connected') {
              setStatus(prev => prev ? { ...prev, openclawGateway: true } : prev);
            } else if (evt.event === 'gateway_disconnected') {
              setStatus(prev => prev ? { ...prev, openclawGateway: false } : prev);
            }
          }
        }
      } catch {
        setConnected(false);
        setConnection(prev => ({ ...prev, status: 'offline' }));
      }
    }

    // Initial poll immediately
    poll();

    // Then poll every 3 seconds
    const interval = setInterval(() => {
      if (active) poll();
    }, 3000);

    return () => {
      active = false;
      clearInterval(interval);
      setConnected(false);
    };
  }, [wallet, connection.registered, addEvent]);

  // ─── Actions ─────────────────────────────────────────────

  const connectAgentFn = useCallback(async (agentUrl: string, apiSecret?: string) => {
    if (!wallet) throw new Error('Wallet not connected');

    const res = await fetch('/api/agent-registry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: wallet, agentUrl, apiSecret: apiSecret || '' }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Registration failed');

    setConnection({
      registered: true,
      status: data.agent?.status || 'unknown',
      agentUrl: data.agent?.agentUrl,
      lastHealthCheck: data.agent?.lastHealthCheck,
    });
  }, [wallet]);

  const disconnectAgentFn = useCallback(async () => {
    if (!wallet) return;

    await fetch('/api/agent-registry', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: wallet }),
    });

    setConnection({ registered: false, status: 'unknown' });
    setConnected(false);
    setStatus(null);
  }, [wallet]);

  const triggerScan = useCallback(async () => {
    if (!wallet) throw new Error('Wallet not connected');
    const res = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'scan', wallet }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Scan failed');
    }
  }, [wallet]);

  const startAgentFn = useCallback(async (smartAccountAddress: string, riskProfile: string) => {
    if (!wallet) throw new Error('Wallet not connected');

    // Initialize
    const initRes = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'initialize', wallet, smartAccountAddress, riskProfile }),
    });
    if (!initRes.ok) {
      const data = await initRes.json();
      throw new Error(data.error || 'Initialization failed');
    }

    // Start
    const startRes = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start', wallet }),
    });
    if (!startRes.ok) {
      const data = await startRes.json();
      throw new Error(data.error || 'Start failed');
    }
  }, [wallet]);

  const stopAgentFn = useCallback(async () => {
    if (!wallet) return;
    await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop', wallet }),
    });
  }, [wallet]);

  const clearEvents = useCallback(() => {
    setEvents([]);
    setLastScan(null);
    setLastError(null);
  }, []);

  return {
    connected,
    connection,
    status,
    events,
    lastScan,
    lastError,
    connectAgent: connectAgentFn,
    disconnectAgent: disconnectAgentFn,
    triggerScan,
    startAgent: startAgentFn,
    stopAgent: stopAgentFn,
    clearEvents,
  };
}

export default useAgentEvents;
