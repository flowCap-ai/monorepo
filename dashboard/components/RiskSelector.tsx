'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Shield, ShieldCheck, ShieldAlert, Zap, TrendingUp, Lock } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────

export type RiskLevel = 'low' | 'medium' | 'high';

interface RiskProfile {
  level: RiskLevel;
  label: string;
  description: string;
  icon: React.ReactNode;
  protocols: string[];
  tokens: string[];
  maxSlippage: string;
  expectedAPY: string;
  color: string;
  borderSelected: string;
  bgSelected: string;
}

const RISK_PROFILES: RiskProfile[] = [
  {
    level: 'low',
    label: 'Conservative',
    description: 'Stablecoins only on Venus lending. Lowest risk, steady returns.',
    icon: <Shield className="w-5 h-5" />,
    protocols: ['Venus'],
    tokens: ['USDT', 'USDC', 'BUSD'],
    maxSlippage: '0.1%',
    expectedAPY: '2–5%',
    color: 'text-emerald-400',
    borderSelected: 'border-emerald-500/40',
    bgSelected: 'bg-emerald-500/[0.04]',
  },
  {
    level: 'medium',
    label: 'Balanced',
    description: 'Stables + BNB. Venus lending + PancakeSwap swaps.',
    icon: <TrendingUp className="w-5 h-5" />,
    protocols: ['Venus', 'PancakeSwap V2'],
    tokens: ['USDT', 'USDC', 'BUSD', 'BNB'],
    maxSlippage: '0.5%',
    expectedAPY: '5–12%',
    color: 'text-orange-400',
    borderSelected: 'border-orange-500/40',
    bgSelected: 'bg-orange-500/[0.04]',
  },
  {
    level: 'high',
    label: 'Aggressive',
    description: 'All assets including volatile. Multiple DEXes and lending pools.',
    icon: <Zap className="w-5 h-5" />,
    protocols: ['Venus', 'PancakeSwap V2', 'PancakeSwap V3'],
    tokens: ['USDT', 'USDC', 'BNB', 'ETH', 'BTCB', 'CAKE'],
    maxSlippage: '1.0%',
    expectedAPY: '8–25%+',
    color: 'text-red-400',
    borderSelected: 'border-red-500/40',
    bgSelected: 'bg-red-500/[0.04]',
  },
];

// ─── Props ───────────────────────────────────────────────────

interface RiskSelectorProps {
  value: RiskLevel;
  onChange: (level: RiskLevel) => void;
  disabled?: boolean;
}

// ─── Component ──────────────────────────────────────────────

export function RiskSelector({ value, onChange, disabled = false }: RiskSelectorProps) {
  const [showDetails, setShowDetails] = useState(true);
  const selected = RISK_PROFILES.find((p) => p.level === value)!;

  return (
    <div className="space-y-4">
      {/* Selection Grid */}
      <div className="grid grid-cols-3 gap-3">
        {RISK_PROFILES.map((profile) => {
          const isSelected = profile.level === value;
          return (
            <button
              key={profile.level}
              disabled={disabled}
              onClick={() => onChange(profile.level)}
              className={`relative p-4 rounded-xl border transition-all text-left ${
                isSelected
                  ? `${profile.borderSelected} ${profile.bgSelected}`
                  : 'border-[var(--border)] bg-surface hover:border-[var(--border-hover)]'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              {/* Icon */}
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${
                  isSelected ? `bg-orange-500/12 ${profile.color}` : 'bg-surface-2 text-zinc-500'
                }`}
              >
                {profile.icon}
              </div>

              <p className={`text-sm font-semibold mb-1 ${isSelected ? 'text-white' : 'text-zinc-300'}`}>
                {profile.label}
              </p>
              <p className="text-[11px] text-zinc-500 leading-relaxed">{profile.description}</p>

              {/* APY badge */}
              <div className="mt-3 inline-flex items-center gap-1 px-2 py-1 rounded-md bg-surface-2 border border-[var(--border)]">
                <TrendingUp className="w-3 h-3 text-orange-400/60" />
                <span className="text-[10px] text-zinc-400 font-mono">{profile.expectedAPY}</span>
              </div>

              {/* Selected indicator */}
              {isSelected && (
                <div className="absolute top-3 right-3">
                  <ShieldCheck className={`w-4 h-4 ${profile.color}`} />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected Profile Details */}
      {showDetails && (
        <div className="p-4 rounded-lg bg-orange-500/[0.03] border border-orange-500/10">
          <div className="flex items-center gap-2 mb-3">
            <Lock className="w-3.5 h-3.5 text-orange-400/60" />
            <span className="text-[11px] text-zinc-400 uppercase tracking-wider font-medium">
              {selected.label} Profile Details
            </span>
          </div>

          <div className="grid grid-cols-3 gap-4 text-[12px]">
            <div>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Protocols</p>
              <p className="text-zinc-300">{selected.protocols.join(', ')}</p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Tokens</p>
              <p className="text-zinc-300">{selected.tokens.join(', ')}</p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Max Slippage</p>
              <p className="text-zinc-300 font-mono">{selected.maxSlippage}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RiskSelector;
