'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Clock, ShieldOff, AlertTriangle, Key, RefreshCw } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────

interface SessionPanelProps {
  sessionAddress: string | null;
  validUntil: number | null;
  remainingSeconds: number;
  isValid: boolean;
  isExpiringSoon: boolean;
  onRevoke: () => void;
  onRenew?: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return 'Expired';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function progressPercent(validUntil: number | null, totalDuration: number = 7 * 86400): number {
  if (!validUntil) return 0;
  const now = Math.floor(Date.now() / 1000);
  const remaining = Math.max(0, validUntil - now);
  return Math.min(100, (remaining / totalDuration) * 100);
}

// ─── Component ──────────────────────────────────────────────

export function SessionPanel({
  sessionAddress,
  validUntil,
  remainingSeconds,
  isValid,
  isExpiringSoon,
  onRevoke,
  onRenew,
}: SessionPanelProps) {
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const progress = progressPercent(validUntil);

  if (!sessionAddress) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-10">
          <div className="w-12 h-12 rounded-2xl bg-surface-2 flex items-center justify-center mb-3">
            <Key className="w-6 h-6 text-zinc-600" />
          </div>
          <p className="text-sm text-zinc-400">No active session key</p>
          <p className="text-xs text-zinc-600 mt-1">Delegate to create one</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={isExpiringSoon ? 'border-orange-500/30' : ''}>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center ${
              isValid
                ? isExpiringSoon
                  ? 'bg-orange-500/12'
                  : 'bg-emerald-500/10'
                : 'bg-red-500/10'
            }`}
          >
            <Clock
              className={`w-5 h-5 ${
                isValid
                  ? isExpiringSoon
                    ? 'text-orange-400/80'
                    : 'text-emerald-400/80'
                  : 'text-red-400/80'
              }`}
            />
          </div>
          <div>
            <CardTitle>Session Key</CardTitle>
            <CardDescription>
              {isValid ? 'Active delegation' : 'Session expired'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-2 space-y-4">
        {/* Session Address */}
        <div className="p-3 rounded-lg bg-surface border border-[var(--border)]">
          <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Session Address</p>
          <p className="text-sm text-white font-mono truncate">{sessionAddress}</p>
        </div>

        {/* U3: Countdown Timer */}
        <div className="p-3 rounded-lg bg-surface border border-[var(--border)]">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Time Remaining</p>
            {isExpiringSoon && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider bg-orange-500/10 text-orange-400 border border-orange-500/20">
                <AlertTriangle className="w-3 h-3" /> Expiring Soon
              </span>
            )}
          </div>

          <p
            className={`text-2xl font-semibold font-mono-nums ${
              isValid
                ? isExpiringSoon
                  ? 'text-orange-400'
                  : 'text-white'
                : 'text-red-400'
            }`}
          >
            {formatCountdown(remainingSeconds)}
          </p>

          {/* Progress Bar */}
          <div className="mt-3 h-1.5 rounded-full bg-surface-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${
                isValid
                  ? isExpiringSoon
                    ? 'bg-orange-500/60'
                    : 'bg-emerald-500/60'
                  : 'bg-red-500/60'
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>

          {validUntil && (
            <p className="text-[10px] text-zinc-600 mt-2">
              Expires: {new Date(validUntil * 1000).toLocaleString()}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {onRenew && (
            <Button variant="outline" className="flex-1" onClick={onRenew}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Renew Session
            </Button>
          )}

          {/* U4: Revoke Button */}
          {!showRevokeConfirm ? (
            <Button
              variant="outline"
              className="flex-1 border-red-500/20 text-red-400 hover:bg-red-500/10"
              onClick={() => setShowRevokeConfirm(true)}
            >
              <ShieldOff className="w-4 h-4 mr-2" />
              Revoke Session
            </Button>
          ) : (
            /* U4: Confirmation */
            <div className="flex-1 p-3 rounded-lg bg-red-500/[0.05] border border-red-500/20 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <p className="text-xs text-red-400 font-medium">Revoke session key?</p>
              </div>
              <p className="text-[11px] text-zinc-500">
                The agent will immediately lose access to your smart account. This cannot be undone.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  className="flex-1"
                  onClick={() => {
                    onRevoke();
                    setShowRevokeConfirm(false);
                  }}
                >
                  Confirm Revoke
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="flex-1"
                  onClick={() => setShowRevokeConfirm(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default SessionPanel;
