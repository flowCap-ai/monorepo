/**
 * Agent Registry — Redis backed (persistent across serverless invocations)
 *
 * Uses REDIS_URL env var (Redis Cloud, Upstash, etc.)
 * Falls back to in-memory map when REDIS_URL is not set (local dev).
 */

import Redis from 'ioredis';

// ─── Types ───────────────────────────────────────────────────

export interface AgentRegistration {
  walletAddress: string;
  agentUrl: string;
  apiSecret: string;
  registeredAt: number;
  lastHealthCheck: number | null;
  status: 'online' | 'offline' | 'unknown';
  label?: string;
}

// ─── Redis client (singleton) ────────────────────────────────

let redisClient: Redis | null = null;

function getRedis(): Redis | null {
  if (!process.env.REDIS_URL) return null;
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    redisClient.on('error', (err) => {
      console.warn('Redis error:', err.message);
    });
  }
  return redisClient;
}

// ─── In-memory fallback (local dev without Redis) ────────────

const memoryRegistry = new Map<string, AgentRegistration>();

// ─── Helpers ─────────────────────────────────────────────────

function normalizeAddress(addr: string): string {
  return addr.toLowerCase().trim();
}

function redisKey(walletAddress: string): string {
  return `flowcap:agent:${normalizeAddress(walletAddress)}`;
}

function validateUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

// ─── Public API ──────────────────────────────────────────────

export async function registerAgent(
  walletAddress: string,
  agentUrl: string,
  apiSecret: string = '',
  label?: string,
): Promise<AgentRegistration> {
  if (!walletAddress || !/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
    throw new Error('Invalid wallet address');
  }

  const normalizedUrl = agentUrl.trim().replace(/\/+$/, '');
  if (!validateUrl(normalizedUrl)) {
    throw new Error('Invalid agent URL. Must be http:// or https://');
  }

  const existing = await getAgent(walletAddress);

  const registration: AgentRegistration = {
    walletAddress,
    agentUrl: normalizedUrl,
    apiSecret,
    registeredAt: existing?.registeredAt || Date.now(),
    lastHealthCheck: null,
    status: 'unknown',
    label,
  };

  const redis = getRedis();
  if (redis) {
    // TTL: 30 days (auto-expires stale registrations)
    await redis.set(redisKey(walletAddress), JSON.stringify(registration), 'EX', 60 * 60 * 24 * 30);
  } else {
    memoryRegistry.set(normalizeAddress(walletAddress), registration);
  }

  return registration;
}

export async function getAgent(walletAddress: string): Promise<AgentRegistration | null> {
  const redis = getRedis();
  if (redis) {
    const data = await redis.get(redisKey(walletAddress));
    if (!data) return null;
    try {
      return JSON.parse(data) as AgentRegistration;
    } catch {
      return null;
    }
  }
  return memoryRegistry.get(normalizeAddress(walletAddress)) ?? null;
}

export async function removeAgent(walletAddress: string): Promise<boolean> {
  const redis = getRedis();
  if (redis) {
    const deleted = await redis.del(redisKey(walletAddress));
    return deleted > 0;
  }
  return memoryRegistry.delete(normalizeAddress(walletAddress));
}

export async function listAgents(): Promise<AgentRegistration[]> {
  const redis = getRedis();
  if (redis) {
    const keys = await redis.keys('flowcap:agent:*');
    if (!keys.length) return [];
    const results = await Promise.all(keys.map(k => redis.get(k)));
    return results
      .filter((r): r is string => r !== null)
      .map(r => {
        try { return JSON.parse(r) as AgentRegistration; } catch { return null; }
      })
      .filter((r): r is AgentRegistration => r !== null);
  }
  return Array.from(memoryRegistry.values());
}

export async function healthCheckAgent(walletAddress: string): Promise<AgentRegistration | null> {
  const agent = await getAgent(walletAddress);
  if (!agent) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const headers: Record<string, string> = {};
    if (agent.apiSecret) {
      headers['Authorization'] = `Bearer ${agent.apiSecret}`;
    }

    const res = await fetch(`${agent.agentUrl}/health`, {
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    agent.status = res.ok ? 'online' : 'offline';
    agent.lastHealthCheck = Date.now();
  } catch {
    agent.status = 'offline';
  }

  const redis = getRedis();
  if (redis) {
    await redis.set(redisKey(walletAddress), JSON.stringify(agent), 'EX', 60 * 60 * 24 * 30);
  } else {
    memoryRegistry.set(normalizeAddress(walletAddress), agent);
  }

  return agent;
}

export async function proxyToAgent(
  walletAddress: string,
  path: string,
  method: 'GET' | 'POST' = 'GET',
  body?: Record<string, unknown>,
): Promise<Response> {
  const agent = await getAgent(walletAddress);
  if (!agent) {
    throw new Error('No agent registered for this wallet. Connect your agent first.');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (agent.apiSecret) {
    headers['Authorization'] = `Bearer ${agent.apiSecret}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`${agent.agentUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    agent.status = 'online';
    agent.lastHealthCheck = Date.now();
    const redis = getRedis();
    if (redis) {
      await redis.set(redisKey(walletAddress), JSON.stringify(agent), 'EX', 60 * 60 * 24 * 30);
    } else {
      memoryRegistry.set(normalizeAddress(walletAddress), agent);
    }

    return res;
  } catch (err) {
    clearTimeout(timeout);
    agent.status = 'offline';
    const redis = getRedis();
    if (redis) {
      await redis.set(redisKey(walletAddress), JSON.stringify(agent), 'EX', 60 * 60 * 24 * 30);
    } else {
      memoryRegistry.set(normalizeAddress(walletAddress), agent);
    }
    throw err;
  }
}
