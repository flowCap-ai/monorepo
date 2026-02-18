/**
 * Agent Registry — SaaS model
 *
 * Maps wallet addresses to their agent server URLs.
 * Each user's OpenClaw agent can run on:
 *   - Their local machine (via tunnel like ngrok, cloudflared)
 *   - A VPS / Cloud VM
 *   - A hosted FlowCap agent instance (future)
 *
 * In production, this would be backed by a database.
 * For hackathon, we use in-memory + filesystem persistence.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ─── Types ───────────────────────────────────────────────────

export interface AgentRegistration {
  /** Wallet address (checksummed or lower) */
  walletAddress: string;
  /** Full URL to agent server, e.g. https://my-agent.example.com:3002 */
  agentUrl: string;
  /** Shared secret for authenticating dashboard→agent requests */
  apiSecret: string;
  /** When the agent was registered */
  registeredAt: number;
  /** Last successful health check */
  lastHealthCheck: number | null;
  /** Current status */
  status: 'online' | 'offline' | 'unknown';
  /** Agent display name (optional) */
  label?: string;
}

// ─── Persistence ─────────────────────────────────────────────

const REGISTRY_DIR = join(homedir(), '.flowcap');
const REGISTRY_FILE = join(REGISTRY_DIR, 'agent-registry.json');

/** In-memory registry (wallet → agent info) */
const registry = new Map<string, AgentRegistration>();

/** Load from disk on startup */
function loadFromDisk(): void {
  try {
    if (existsSync(REGISTRY_FILE)) {
      const data = JSON.parse(readFileSync(REGISTRY_FILE, 'utf-8'));
      if (Array.isArray(data)) {
        for (const entry of data) {
          registry.set(normalizeAddress(entry.walletAddress), entry);
        }
      }
    }
  } catch (err) {
    console.warn('⚠️ Failed to load agent registry:', err);
  }
}

/** Persist to disk */
function saveToDisk(): void {
  try {
    if (!existsSync(REGISTRY_DIR)) {
      mkdirSync(REGISTRY_DIR, { recursive: true });
    }
    const data = Array.from(registry.values());
    writeFileSync(REGISTRY_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.warn('⚠️ Failed to save agent registry:', err);
  }
}

// Load on module init
loadFromDisk();

// ─── Helpers ─────────────────────────────────────────────────

function normalizeAddress(addr: string): string {
  return addr.toLowerCase().trim();
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

/**
 * Register (or update) an agent for a wallet address.
 */
export function registerAgent(
  walletAddress: string,
  agentUrl: string,
  apiSecret: string = '',
  label?: string,
): AgentRegistration {
  if (!walletAddress || !/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
    throw new Error('Invalid wallet address');
  }

  // Normalize URL — strip trailing slash
  let normalizedUrl = agentUrl.trim().replace(/\/+$/, '');
  if (!validateUrl(normalizedUrl)) {
    throw new Error('Invalid agent URL. Must be http:// or https://');
  }

  const key = normalizeAddress(walletAddress);
  const existing = registry.get(key);

  const registration: AgentRegistration = {
    walletAddress,
    agentUrl: normalizedUrl,
    apiSecret,
    registeredAt: existing?.registeredAt || Date.now(),
    lastHealthCheck: null,
    status: 'unknown',
    label,
  };

  registry.set(key, registration);
  saveToDisk();

  return registration;
}

/**
 * Get agent registration for a wallet.
 */
export function getAgent(walletAddress: string): AgentRegistration | null {
  return registry.get(normalizeAddress(walletAddress)) ?? null;
}

/**
 * Remove agent registration.
 */
export function removeAgent(walletAddress: string): boolean {
  const removed = registry.delete(normalizeAddress(walletAddress));
  if (removed) saveToDisk();
  return removed;
}

/**
 * List all registered agents.
 */
export function listAgents(): AgentRegistration[] {
  return Array.from(registry.values());
}

/**
 * Health check a specific agent. Updates status in registry.
 */
export async function healthCheckAgent(walletAddress: string): Promise<AgentRegistration | null> {
  const agent = getAgent(walletAddress);
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

    if (res.ok) {
      agent.status = 'online';
      agent.lastHealthCheck = Date.now();
    } else {
      agent.status = 'offline';
    }
  } catch {
    agent.status = 'offline';
  }

  saveToDisk();
  return agent;
}

/**
 * Proxy a request to a user's agent server.
 * Returns the raw Response from the agent.
 */
export async function proxyToAgent(
  walletAddress: string,
  path: string,
  method: 'GET' | 'POST' = 'GET',
  body?: Record<string, unknown>,
): Promise<Response> {
  const agent = getAgent(walletAddress);
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

    // Update health status
    agent.status = 'online';
    agent.lastHealthCheck = Date.now();
    saveToDisk();

    return res;
  } catch (err) {
    clearTimeout(timeout);
    agent.status = 'offline';
    saveToDisk();
    throw err;
  }
}
