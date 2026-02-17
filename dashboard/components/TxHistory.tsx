'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import {
  History,
  ArrowRightLeft,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle,
  XCircle,
  Clock,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────

export interface Transaction {
  id: string;
  type: 'swap' | 'supply' | 'withdraw' | 'approve' | 'delegate' | 'revoke';
  status: 'pending' | 'success' | 'failed';
  timestamp: number;
  txHash?: string;
  /** Human-readable description */
  description: string;
  /** Token amounts involved */
  tokenIn?: { symbol: string; amount: string };
  tokenOut?: { symbol: string; amount: string };
  /** Gas cost in USD */
  gasCostUSD?: number;
  /** Protocol used */
  protocol?: string;
}

// ─── Local storage key ──────────────────────────────────────
const TX_STORAGE_KEY = 'flowcap_tx_history';
const MAX_TX_HISTORY = 100;

/** Retrieve transaction history from localStorage */
function loadTransactions(): Transaction[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(TX_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Transaction[]) : [];
  } catch {
    return [];
  }
}

/** Persist transaction history to localStorage */
function saveTransactions(txs: Transaction[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TX_STORAGE_KEY, JSON.stringify(txs.slice(0, MAX_TX_HISTORY)));
}

/** Add a new transaction (call from other components) */
export function addTransaction(tx: Transaction): void {
  const txs = loadTransactions();
  txs.unshift(tx);
  saveTransactions(txs);
  // Dispatch storage event so the TxHistory component can react
  window.dispatchEvent(new Event('flowcap_tx_update'));
}

// ─── Helpers ─────────────────────────────────────────────────

function typeIcon(type: Transaction['type']) {
  switch (type) {
    case 'swap':
      return <ArrowRightLeft className="w-4 h-4 text-orange-400/80" />;
    case 'supply':
      return <ArrowUpRight className="w-4 h-4 text-emerald-400/80" />;
    case 'withdraw':
      return <ArrowDownLeft className="w-4 h-4 text-blue-400/80" />;
    case 'approve':
      return <CheckCircle className="w-4 h-4 text-zinc-400" />;
    case 'delegate':
      return <ArrowUpRight className="w-4 h-4 text-orange-400/80" />;
    case 'revoke':
      return <XCircle className="w-4 h-4 text-red-400/80" />;
  }
}

function statusBadge(status: Transaction['status']) {
  switch (status) {
    case 'success':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <CheckCircle className="w-3 h-3" /> Success
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20">
          <XCircle className="w-3 h-3" /> Failed
        </span>
      );
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider bg-orange-500/10 text-orange-400 border border-orange-500/20">
          <Clock className="w-3 h-3 animate-pulse" /> Pending
        </span>
      );
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;

  if (diff < 60_000) return 'Just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Component ──────────────────────────────────────────────

export function TxHistory() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState<'all' | Transaction['type']>('all');

  const refresh = useCallback(() => {
    setTransactions(loadTransactions());
  }, []);

  useEffect(() => {
    refresh();
    // Listen for updates from addTransaction or other tabs
    const handler = () => refresh();
    window.addEventListener('flowcap_tx_update', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('flowcap_tx_update', handler);
      window.removeEventListener('storage', handler);
    };
  }, [refresh]);

  const filtered = filter === 'all' ? transactions : transactions.filter((tx) => tx.type === filter);

  const filterButtons: { value: 'all' | Transaction['type']; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'swap', label: 'Swaps' },
    { value: 'supply', label: 'Supply' },
    { value: 'withdraw', label: 'Withdraw' },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center">
              <History className="w-5 h-5 text-orange-400/80" />
            </div>
            <div>
              <CardTitle>Transaction History</CardTitle>
              <CardDescription>Recent agent operations</CardDescription>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={refresh} title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mt-4">
          {filterButtons.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === f.value
                  ? 'bg-orange-500/12 text-orange-400 border border-orange-500/30'
                  : 'bg-surface-2 text-zinc-500 border border-[var(--border)] hover:border-[var(--border-hover)]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="pt-2">
        {filtered.length === 0 ? (
          <div className="text-center py-12">
            <History className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
            <p className="text-sm text-zinc-500">No transactions yet</p>
            <p className="text-xs text-zinc-600 mt-1">Agent operations will appear here</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-surface border border-[var(--border)] hover:border-[var(--border-hover)] transition-all"
              >
                {/* Icon */}
                <div className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center flex-shrink-0">
                  {typeIcon(tx.type)}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm text-white font-medium truncate">{tx.description}</p>
                    {tx.protocol && (
                      <span className="text-[10px] text-zinc-600 uppercase tracking-wider flex-shrink-0">
                        {tx.protocol}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                    <span>{formatTime(tx.timestamp)}</span>
                    {tx.gasCostUSD != null && <span>Gas: ${tx.gasCostUSD.toFixed(2)}</span>}
                    {tx.tokenIn && tx.tokenOut && (
                      <span>
                        {tx.tokenIn.amount} {tx.tokenIn.symbol} → {tx.tokenOut.amount} {tx.tokenOut.symbol}
                      </span>
                    )}
                  </div>
                </div>

                {/* Status + Link */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {statusBadge(tx.status)}
                  {tx.txHash && (
                    <a
                      href={`https://bscscan.com/tx/${tx.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg hover:bg-surface-2 transition-colors"
                      title="View on BscScan"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-zinc-500 hover:text-orange-400" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default TxHistory;
