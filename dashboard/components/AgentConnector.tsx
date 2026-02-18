'use client';

import { useState } from 'react';
import { Card, CardContent } from './ui/card';
import { Server, Wifi, WifiOff, Link2, Unplug, RefreshCw, ExternalLink } from 'lucide-react';
import type { AgentConnection } from '../hooks/useAgentEvents';

interface AgentConnectorProps {
  walletAddress?: string;
  connection: AgentConnection;
  connected: boolean;
  onConnect: (agentUrl: string, apiSecret?: string) => Promise<void>;
  onDisconnect: () => Promise<void>;
}

export function AgentConnector({
  walletAddress,
  connection,
  connected,
  onConnect,
  onDisconnect,
}: AgentConnectorProps) {
  const [agentUrl, setAgentUrl] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  async function handleConnect() {
    if (!agentUrl.trim()) {
      setError('Enter your agent server URL');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onConnect(agentUrl.trim(), apiSecret.trim() || undefined);
      setAgentUrl('');
      setApiSecret('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    setLoading(true);
    try {
      await onDisconnect();
    } finally {
      setLoading(false);
    }
  }

  if (!walletAddress) {
    return (
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Server className="w-4 h-4 text-zinc-500" />
            <h3 className="text-sm font-semibold text-white">Agent Connection</h3>
          </div>
          <p className="text-xs text-zinc-500">Connect your wallet first to set up your agent.</p>
        </CardContent>
      </Card>
    );
  }

  // ─── Connected state ────────────────────────────────────────
  if (connection.registered) {
    return (
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              {connected ? (
                <Wifi className="w-4 h-4 text-emerald-400" />
              ) : (
                <WifiOff className="w-4 h-4 text-orange-400" />
              )}
              <h3 className="text-sm font-semibold text-white">Agent Connection</h3>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${
                  connection.status === 'online'
                    ? 'bg-emerald-400 animate-pulse-dot'
                    : connection.status === 'offline'
                    ? 'bg-red-400'
                    : 'bg-zinc-500'
                }`}
              />
              <span className="text-[11px] text-zinc-400 capitalize">{connection.status}</span>
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between p-3 rounded-lg bg-surface border border-[var(--border)]">
              <div className="flex items-center gap-2 min-w-0">
                <Link2 className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <span className="text-xs text-zinc-300 truncate font-mono">
                  {connection.agentUrl}
                </span>
              </div>
              {connection.agentUrl && (
                <a
                  href={`${connection.agentUrl}/health`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0 ml-2"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            {connection.lastHealthCheck && (
              <p className="text-[10px] text-zinc-600">
                Last check: {new Date(connection.lastHealthCheck).toLocaleTimeString()}
              </p>
            )}

            <button
              onClick={handleDisconnect}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-red-400 border border-[var(--border)] hover:border-red-500/30 rounded-md transition-all"
            >
              <Unplug className="w-3 h-3" />
              {loading ? 'Disconnecting...' : 'Disconnect Agent'}
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ─── Not connected — registration form ──────────────────────
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Server className="w-4 h-4 text-orange-400/70" />
          <h3 className="text-sm font-semibold text-white">Connect Your Agent</h3>
        </div>

        <p className="text-xs text-zinc-500 mb-4 leading-relaxed">
          Enter the URL of your OpenClaw agent server. It can run on your machine
          (use a tunnel like <code className="text-orange-400/60">ngrok</code> or{' '}
          <code className="text-orange-400/60">cloudflared</code>) or on a remote VPS.
        </p>

        <div className="space-y-3">
          {/* Agent URL input */}
          <div>
            <label className="text-[11px] text-zinc-500 mb-1 block">Agent Server URL</label>
            <input
              type="url"
              placeholder="https://your-agent.example.com:3002"
              value={agentUrl}
              onChange={(e) => setAgentUrl(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-surface border border-[var(--border)] rounded-md text-white placeholder:text-zinc-600 focus:border-orange-500/30 focus:outline-none transition-colors font-mono"
            />
          </div>

          {/* Advanced toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {showAdvanced ? '▾' : '▸'} Advanced options
          </button>

          {showAdvanced && (
            <div>
              <label className="text-[11px] text-zinc-500 mb-1 block">
                API Secret <span className="text-zinc-600">(optional)</span>
              </label>
              <input
                type="password"
                placeholder="Bearer token for authentication"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-surface border border-[var(--border)] rounded-md text-white placeholder:text-zinc-600 focus:border-orange-500/30 focus:outline-none transition-colors"
              />
            </div>
          )}

          {error && (
            <p className="text-xs text-red-400 bg-red-500/5 border border-red-500/10 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <button
            onClick={handleConnect}
            disabled={loading || !agentUrl.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium bg-orange-500 hover:bg-orange-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-md transition-colors"
          >
            {loading ? (
              <>
                <RefreshCw className="w-3 h-3 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Link2 className="w-3 h-3" />
                Connect Agent
              </>
            )}
          </button>

          {/* Setup instructions */}
          <div className="mt-3 p-3 rounded-lg bg-surface border border-[var(--border)]">
            <p className="text-[11px] text-zinc-500 font-medium mb-2">Quick Setup:</p>
            <div className="space-y-1.5 text-[11px] text-zinc-600 font-mono">
              <p>
                <span className="text-zinc-500">1.</span>{' '}
                <code className="text-orange-400/50">npm run agent:serve</code>
              </p>
              <p>
                <span className="text-zinc-500">2.</span>{' '}
                <code className="text-orange-400/50">npx cloudflared tunnel --url http://localhost:3002</code>
              </p>
              <p>
                <span className="text-zinc-500">3.</span>{' '}
                Paste the tunnel URL above
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
