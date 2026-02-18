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
  const eventSourceRef = useRef<EventSource | null>(null);
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

  // ─── Connect SSE via dashboard proxy ─────────────────────
  useEffect(() => {
    if (typeof window === 'undefined' || !wallet || !connection.registered) return;

    let retryTimeout: ReturnType<typeof setTimeout>;
    let es: EventSource;

    function connect() {
      // SSE goes through the dashboard API proxy, NOT directly to agent
      es = new EventSource(`/api/agent/events?wallet=${wallet}`);
      eventSourceRef.current = es;

      es.addEventListener('connected', (e) => {
        setConnected(true);
        try {
          const data = JSON.parse((e as MessageEvent).data);
          setStatus(data);
        } catch {}
      });

      es.addEventListener('proxy_connected', (e) => {
        setConnected(true);
        addEvent('proxy_connected', JSON.parse((e as MessageEvent).data));
      });

      es.addEventListener('proxy_disconnected', (e) => {
        setConnected(false);
        addEvent('proxy_disconnected', JSON.parse((e as MessageEvent).data));
      });

      es.addEventListener('proxy_error', (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        addEvent('proxy_error', data);
        setLastError(data.error as string);
      });

      es.addEventListener('scan_started', (e) => {
        addEvent('scan_started', JSON.parse((e as MessageEvent).data));
      });

      es.addEventListener('scan_completed', (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        addEvent('scan_completed', data);
        setLastScan({ action: data.action, details: data.details, txHash: data.txHash });
        setLastError(null);
      });

      es.addEventListener('scan_error', (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        addEvent('scan_error', data);
        setLastError(data.error as string);
      });

      es.addEventListener('agent_initialized', (e) => {
        addEvent('agent_initialized', JSON.parse((e as MessageEvent).data));
      });

      es.addEventListener('agent_starting', (e) => {
        addEvent('agent_starting', JSON.parse((e as MessageEvent).data));
      });

      es.addEventListener('agent_stopped', (e) => {
        addEvent('agent_stopped', JSON.parse((e as MessageEvent).data));
      });

      es.addEventListener('agent_error', (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        addEvent('agent_error', data);
        setLastError(data.error as string);
      });

      es.addEventListener('gateway_connected', (e) => {
        addEvent('gateway_connected', JSON.parse((e as MessageEvent).data));
        setStatus(prev => prev ? { ...prev, openclawGateway: true } : prev);
      });

      es.addEventListener('gateway_disconnected', (e) => {
        addEvent('gateway_disconnected', JSON.parse((e as MessageEvent).data));
        setStatus(prev => prev ? { ...prev, openclawGateway: false } : prev);
      });

      es.addEventListener('error', (e) => {
        try {
          const data = JSON.parse((e as MessageEvent).data);
          setLastError(data.error as string);
          addEvent('error', data);
        } catch {}
      });

      es.onmessage = (e) => {
        try { addEvent('message', JSON.parse(e.data)); } catch {}
      };

      es.onerror = () => {
        setConnected(false);
        es.close();
        retryTimeout = setTimeout(connect, 5000);
      };
    }

    connect();

    return () => {
      clearTimeout(retryTimeout);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setConnected(false);
    };
  }, [wallet, connection.registered, addEvent]);

  // ─── Periodic status fetch (via dashboard proxy) ─────────
  useEffect(() => {
    if (!wallet || !connection.registered) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/agent?wallet=${wallet}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status) setStatus(data.status);
          setConnection(prev => ({ ...prev, status: 'online' }));
        }
      } catch {
        setConnection(prev => ({ ...prev, status: 'offline' }));
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [wallet, connection.registered]);

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
