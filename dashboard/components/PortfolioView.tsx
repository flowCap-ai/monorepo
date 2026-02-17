'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { PieChart, TrendingUp, TrendingDown, Coins, DollarSign, Percent } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────

export interface Position {
  id: string;
  protocol: string;
  poolName: string;
  token: string;
  amount: string;
  valueUSD: number;
  apy: number;
  /** Unrealized P&L in USD */
  pnlUSD: number;
  /** Entry date timestamp */
  entryDate: number;
}

interface PortfolioViewProps {
  positions?: Position[];
  totalValueUSD?: number;
  totalPnlUSD?: number;
  isLoading?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────

function formatUSD(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDays(entryTimestamp: number): string {
  const days = Math.floor((Date.now() - entryTimestamp) / 86400_000);
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  return `${days} days`;
}

// ─── Component ──────────────────────────────────────────────

export function PortfolioView({
  positions = [],
  totalValueUSD,
  totalPnlUSD,
  isLoading = false,
}: PortfolioViewProps) {
  const total = totalValueUSD ?? positions.reduce((s, p) => s + p.valueUSD, 0);
  const totalPnl = totalPnlUSD ?? positions.reduce((s, p) => s + p.pnlUSD, 0);
  const weightedAPY =
    total > 0
      ? positions.reduce((s, p) => s + p.apy * (p.valueUSD / total), 0)
      : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center">
            <PieChart className="w-5 h-5 text-orange-400/80" />
          </div>
          <div>
            <CardTitle>Portfolio Overview</CardTitle>
            <CardDescription>Your active DeFi positions</CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-2 space-y-4">
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-lg bg-surface border border-[var(--border)]">
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Total Value</p>
            <div className="flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-orange-400/60" />
              <p className="text-lg font-semibold text-white font-mono-nums">
                {isLoading ? '...' : formatUSD(total)}
              </p>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-surface border border-[var(--border)]">
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">P&L</p>
            <div className="flex items-center gap-1.5">
              {totalPnl >= 0 ? (
                <TrendingUp className="w-4 h-4 text-emerald-400/60" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-400/60" />
              )}
              <p
                className={`text-lg font-semibold font-mono-nums ${
                  totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {isLoading ? '...' : `${totalPnl >= 0 ? '+' : ''}${formatUSD(totalPnl)}`}
              </p>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-surface border border-[var(--border)]">
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Avg APY</p>
            <div className="flex items-center gap-1.5">
              <Percent className="w-4 h-4 text-orange-400/60" />
              <p className="text-lg font-semibold text-white font-mono-nums">
                {isLoading ? '...' : `${weightedAPY.toFixed(2)}%`}
              </p>
            </div>
          </div>
        </div>

        {/* Positions Table */}
        {positions.length === 0 ? (
          <div className="text-center py-10">
            <Coins className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
            <p className="text-sm text-zinc-500">No active positions</p>
            <p className="text-xs text-zinc-600 mt-1">Delegate to start earning yield</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Header */}
            <div className="grid grid-cols-6 px-3 py-2 text-[10px] text-zinc-600 uppercase tracking-wider">
              <span className="col-span-2">Position</span>
              <span>Value</span>
              <span>APY</span>
              <span>P&L</span>
              <span>Holding</span>
            </div>

            {/* Rows */}
            {positions.map((pos) => (
              <div
                key={pos.id}
                className="grid grid-cols-6 items-center p-3 rounded-lg bg-surface border border-[var(--border)] hover:border-[var(--border-hover)] transition-all"
              >
                {/* Position Info */}
                <div className="col-span-2 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                    <Coins className="w-3.5 h-3.5 text-orange-400/70" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-white font-medium truncate">{pos.token}</p>
                    <p className="text-[10px] text-zinc-600">{pos.protocol} · {pos.poolName}</p>
                  </div>
                </div>

                {/* Value */}
                <p className="text-sm text-white font-mono-nums">{formatUSD(pos.valueUSD)}</p>

                {/* APY */}
                <p className="text-sm text-orange-400 font-mono-nums">{pos.apy.toFixed(2)}%</p>

                {/* P&L */}
                <p
                  className={`text-sm font-mono-nums ${
                    pos.pnlUSD >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {pos.pnlUSD >= 0 ? '+' : ''}{formatUSD(pos.pnlUSD)}
                </p>

                {/* Days */}
                <p className="text-sm text-zinc-400">{formatDays(pos.entryDate)}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default PortfolioView;
