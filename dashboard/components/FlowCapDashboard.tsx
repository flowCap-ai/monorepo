'use client';

/**
 * FlowCap Dashboard — Professional DeFi delegation UI
 *
 * Flow:
 * 1. Generate Session Key (Biconomy SDK - Policy-based)
 * 2. User signs delegation via Smart Account
 * 3. Transmit via API to OpenClaw
 * 4. Agent starts yield monitoring
 */

import { useState, useEffect } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { createSmartAccount, generateSessionKey, delegateSessionKey, type SessionKeyData } from '../lib/biconomyClient';
import { cn } from '../lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Progress } from './ui/progress';
import { Separator } from './ui/separator';
import {
  Shield,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  DollarSign,
  RotateCcw,
  Rocket,
  Eye,
  Wallet,
  TrendingUp,
  Zap,
  ChevronRight,
} from 'lucide-react';

type RiskProfile = 'low' | 'medium' | 'high';

const RISK_PROFILES = {
  low: {
    label: 'Conservative',
    description: 'Stablecoins only',
    tokens: ['USDT', 'USDC', 'BUSD'],
    protocols: ['Venus', 'Lista'],
    maxDelegation: 5000,
    slippage: '0.5%',
    intensity: 'low' as const,
    icon: Shield,
  },
  medium: {
    label: 'Balanced',
    description: 'Stables + BNB',
    tokens: ['USDT', 'USDC', 'BUSD', 'BNB', 'WBNB'],
    protocols: ['Venus', 'Lista', 'PancakeSwap'],
    maxDelegation: 10000,
    slippage: '1.0%',
    intensity: 'mid' as const,
    icon: TrendingUp,
  },
  high: {
    label: 'Aggressive',
    description: 'All protocols & tokens',
    tokens: ['USDT', 'USDC', 'BUSD', 'BNB', 'WBNB', 'ETH', 'BTCB', 'CAKE'],
    protocols: ['Venus', 'Lista', 'PancakeSwap', 'Alpaca'],
    maxDelegation: 50000,
    slippage: '2.0%',
    intensity: 'high' as const,
    icon: Zap,
  },
} as const;

// Unified orange-intensity based styling — no more competing colors
const intensityStyles = {
  low: {
    border: 'border-zinc-700/40',
    selected: 'border-orange-500/30 bg-orange-500/[0.04]',
    bg: 'bg-zinc-800/50',
    text: 'text-zinc-300',
    accent: 'text-orange-400/60',
  },
  mid: {
    border: 'border-zinc-700/40',
    selected: 'border-orange-500/50 bg-orange-500/[0.06]',
    bg: 'bg-orange-500/8',
    text: 'text-orange-400',
    accent: 'text-orange-400',
  },
  high: {
    border: 'border-zinc-700/40',
    selected: 'border-orange-500/30 bg-orange-500/[0.04]',
    bg: 'bg-zinc-800/50',
    text: 'text-zinc-300',
    accent: 'text-orange-400/80',
  },
};

export default function FlowCapDashboard() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [riskProfile, setRiskProfile] = useState<RiskProfile>('low');
  const [maxInvestment, setMaxInvestment] = useState<string>('1000');
  const [loading, setLoading] = useState(false);
  const [delegationStep, setDelegationStep] = useState<string>('');
  const [delegationProgress, setDelegationProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isDelegated, setIsDelegated] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);

  useEffect(() => {
    const delegated = localStorage.getItem('flowcap-delegated');
    if (delegated === 'true') {
      setIsDelegated(true);
      setIsMonitoring(true);
    }
  }, []);

  const handleOneClickDelegate = async () => {
    if (!address || !isConnected) {
      setError('Please connect your wallet first');
      return;
    }

    setLoading(true);
    setError(null);
    setDelegationStep('');
    setDelegationProgress(0);

    try {
      // Step 1: Generate session key
      setDelegationStep('Generating session key...');
      setDelegationProgress(20);

      const totalDelegationUSD = parseFloat(maxInvestment);
      if (isNaN(totalDelegationUSD) || totalDelegationUSD < 1) {
        throw new Error('Minimum delegation is $1');
      }

      const profile = RISK_PROFILES[riskProfile];
      if (totalDelegationUSD > profile.maxDelegation) {
        throw new Error(`${profile.label} profile maximum is $${profile.maxDelegation.toLocaleString()}`);
      }

      const smartAccount = await createSmartAccount(address);
      const totalDelegationWei = BigInt(Math.floor(totalDelegationUSD * 1e18));
      const sessionKeyData = generateSessionKey(smartAccount.address, riskProfile, totalDelegationWei);

      // Step 2: Sign delegation
      setDelegationStep('Waiting for wallet signature...');
      setDelegationProgress(40);

      const message = `FlowCap Agent Delegation

I authorize FlowCap to manage my DeFi positions via OpenClaw with these restrictions:

Smart Account: ${smartAccount.address}
Session Key: ${sessionKeyData.sessionAddress}
Risk Profile: ${riskProfile.toUpperCase()}
Total Delegated: $${totalDelegationUSD.toLocaleString()} USD
Valid Until: ${new Date(sessionKeyData.validUntil * 1000).toLocaleString()}

SECURITY GUARANTEES:
✓ Agent can trade with TOTAL of $${totalDelegationUSD.toLocaleString()}
✓ Agent can ONLY swap and supply/withdraw on allowed protocols
✓ Agent CANNOT transfer funds externally
✓ Session expires in 7 days

OpenClaw will monitor 24/7. You can close this dashboard anytime.`;

      await signMessageAsync({ message });

      // Step 3: On-chain delegation
      setDelegationStep('Delegating on-chain...');
      setDelegationProgress(65);

      const delegationResult = await delegateSessionKey(
        address,
        smartAccount.address,
        sessionKeyData
      );

      if (!delegationResult.success) {
        throw new Error(`Delegation failed: ${delegationResult.error}`);
      }

      // Step 4: Transmit to agent
      setDelegationStep('Connecting to agent...');
      setDelegationProgress(85);

      const delegationPayload = {
        sessionKey: sessionKeyData.sessionPrivateKey,
        sessionAddress: sessionKeyData.sessionAddress,
        smartAccountAddress: smartAccount.address,
        riskProfile,
        maxInvestment,
        validUntil: sessionKeyData.validUntil,
        permissions: sessionKeyData.permissions.map((p) => ({
          target: p.target,
          functionSelector: p.functionSelector,
          valueLimit: p.valueLimit.toString(),
        })),
        chain: { id: 56, name: 'BNB Chain' },
      };

      const response = await fetch('/api/delegate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(delegationPayload),
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to transmit delegation');
      }

      // Complete
      setDelegationProgress(100);
      setDelegationStep('Delegation complete!');

      localStorage.setItem('flowcap-session-key', sessionKeyData.sessionPrivateKey);
      localStorage.setItem('flowcap-smart-account', smartAccount.address);
      localStorage.setItem('flowcap-risk-profile', riskProfile);
      localStorage.setItem('flowcap-max-investment', maxInvestment);
      localStorage.setItem('flowcap-delegated', 'true');

      setIsDelegated(true);
      setIsMonitoring(true);

      setTimeout(() => {
        setDelegationStep('');
        setDelegationProgress(0);
      }, 2000);
    } catch (err) {
      console.error('Delegation error:', err);
      setError(err instanceof Error ? err.message : 'Delegation failed');
      setDelegationStep('');
      setDelegationProgress(0);
    } finally {
      setLoading(false);
    }
  };

  const resetDelegation = () => {
    localStorage.removeItem('flowcap-delegated');
    localStorage.removeItem('flowcap-session-key');
    localStorage.removeItem('flowcap-smart-account');
    localStorage.removeItem('flowcap-risk-profile');
    localStorage.removeItem('flowcap-max-investment');
    setIsDelegated(false);
    setIsMonitoring(false);
    setError(null);
  };

  const profile = RISK_PROFILES[riskProfile];
  const styles = intensityStyles[profile.intensity];

  // ─── NOT CONNECTED ─────────────────────────────────────
  if (!isConnected) {
    return (
      <Card className="border-orange-500/10">
        <CardContent className="p-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-orange-500/8 flex items-center justify-center mx-auto mb-4">
            <Wallet className="w-6 h-6 text-orange-400/70" />
          </div>
          <h3 className="text-base font-semibold text-white mb-2">Connect Your Wallet</h3>
          <p className="text-sm text-zinc-500 max-w-sm mx-auto">
            Connect your wallet to delegate funds and start your autonomous OpenClaw yield manager.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ─── MONITORING ACTIVE ─────────────────────────────────
  if (isDelegated && isMonitoring) {
    const storedProfile = (localStorage.getItem('flowcap-risk-profile') || 'low') as RiskProfile;
    const storedAmount = localStorage.getItem('flowcap-max-investment') || '1000';
    const storedAccount = localStorage.getItem('flowcap-smart-account') || '';
    const activeProfile = RISK_PROFILES[storedProfile];

    return (
      <Card className="border-orange-500/15 glow">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <CardTitle className="text-orange-400">OpenClaw Active</CardTitle>
                <CardDescription>Monitoring your DeFi positions 24/7</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-orange-500/8 border border-orange-500/15">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
              <span className="text-xs font-medium text-orange-400">Live</span>
            </div>
          </div>
        </CardHeader>

        <Separator />

        <CardContent className="pt-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <div className="p-3 rounded-lg bg-surface border border-[var(--border)]">
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Delegation</p>
              <p className="text-lg font-semibold text-white font-mono-nums">${Number(storedAmount).toLocaleString()}</p>
            </div>
            <div className="p-3 rounded-lg bg-surface border border-[var(--border)]">
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Risk Profile</p>
              <p className="text-sm font-medium text-orange-400">{activeProfile.label}</p>
            </div>
            <div className="p-3 rounded-lg bg-surface border border-[var(--border)]">
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Account</p>
              <p className="text-sm font-mono text-zinc-400">{storedAccount.slice(0, 6)}...{storedAccount.slice(-4)}</p>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-orange-500/[0.03] border border-orange-500/10 mb-5">
            <div className="flex items-start gap-3">
              <Eye className="w-4 h-4 text-orange-400/60 mt-0.5 shrink-0" />
              <div className="text-sm text-zinc-400 leading-relaxed">
                <p>Your agent is running autonomously via OpenClaw.</p>
                <p className="mt-1 text-zinc-600 text-xs">
                  Scanning every 5 min · Session expires in 7 days · You can safely close this page.
                </p>
              </div>
            </div>
          </div>

          <Button variant="outline" size="sm" onClick={resetDelegation} className="w-full sm:w-auto text-zinc-400 hover:text-white">
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Delegation
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ─── DELEGATION UI ─────────────────────────────────────
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center">
            <Rocket className="w-5 h-5 text-orange-400/80" />
          </div>
          <div>
            <CardTitle>Delegate to OpenClaw</CardTitle>
            <CardDescription>Configure and start your autonomous OpenClaw yield manager</CardDescription>
          </div>
        </div>
      </CardHeader>

      <Separator />

      <CardContent className="pt-5 space-y-6">
        {/* ─── AMOUNT ──────────────────────────────────── */}
        <div>
          <label className="text-sm font-medium text-zinc-300 mb-2 block">
            Delegation Amount
          </label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
            <Input
              type="number"
              value={maxInvestment}
              onChange={(e) => setMaxInvestment(e.target.value)}
              min="1"
              max={profile.maxDelegation}
              step="1"
              disabled={loading}
              className="pl-9 h-12 text-lg"
              placeholder="1000"
            />
          </div>
          <p className="text-[11px] text-zinc-600 mt-1.5">
            Min $1 · Max ${profile.maxDelegation.toLocaleString()} ({profile.label})
          </p>
        </div>

        {/* ─── RISK PROFILE ────────────────────────────── */}
        <div>
          <label className="text-sm font-medium text-zinc-300 mb-3 block">
            Risk Profile
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(Object.entries(RISK_PROFILES) as [RiskProfile, typeof RISK_PROFILES[RiskProfile]][]).map(
              ([key, p]) => {
                const s = intensityStyles[p.intensity];
                const isSelected = riskProfile === key;
                const Icon = p.icon;

                return (
                  <button
                    key={key}
                    onClick={() => setRiskProfile(key)}
                    disabled={loading}
                    className={cn(
                      'relative p-4 rounded-xl border transition-all duration-200 text-left group',
                      'hover:border-[var(--border-hover)] disabled:opacity-50 disabled:cursor-not-allowed',
                      isSelected ? s.selected : 'border-[var(--border)] bg-transparent'
                    )}
                  >
                    <div className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center mb-2.5',
                      isSelected ? 'bg-orange-500/12' : 'bg-zinc-800/50'
                    )}>
                      <Icon className={cn('w-4 h-4', isSelected ? 'text-orange-400' : 'text-zinc-500')} />
                    </div>
                    <div className={cn('font-semibold text-sm mb-0.5', isSelected ? 'text-orange-400' : 'text-zinc-300')}>
                      {p.label}
                    </div>
                    <div className="text-[11px] text-zinc-500">{p.description}</div>
                    <div className="text-[11px] text-zinc-600 mt-1.5 font-mono-nums">
                      Max ${p.maxDelegation.toLocaleString()} · {p.slippage}
                    </div>
                    {isSelected && (
                      <div className="absolute top-3 right-3">
                        <CheckCircle2 className="w-4 h-4 text-orange-400" />
                      </div>
                    )}
                  </button>
                );
              }
            )}
          </div>
        </div>

        {/* ─── PROFILE DETAILS ─────────────────────────── */}
        <div className="p-4 rounded-lg bg-surface border border-[var(--border)] space-y-2.5">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-3.5 h-3.5 text-orange-400/60" />
            <span className="text-xs font-medium text-zinc-400">Profile Details</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-zinc-600">Protocols</span>
              <span className="text-zinc-300">{profile.protocols.join(', ')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-600">Max Slippage</span>
              <span className="text-zinc-300 font-mono-nums">{profile.slippage}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-600">Tokens</span>
              <span className="text-zinc-300">{profile.tokens.join(', ')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-600">Session</span>
              <span className="text-zinc-300">7 days</span>
            </div>
          </div>
        </div>

        {/* ─── PROGRESS ────────────────────────────────── */}
        {delegationStep && (
          <div className="space-y-2.5">
            <Progress value={delegationProgress} />
            <div className="flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 text-orange-400 animate-spin" />
              <p className="text-sm text-zinc-400">{delegationStep}</p>
            </div>
          </div>
        )}

        {/* ─── ERROR ───────────────────────────────────── */}
        {error && (
          <div className="p-3 rounded-lg bg-orange-500/[0.04] border border-orange-500/15 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
            <p className="text-sm text-orange-400/80">{error}</p>
          </div>
        )}

        {/* ─── DELEGATE BUTTON ─────────────────────────── */}
        <Button
          onClick={handleOneClickDelegate}
          disabled={loading}
          size="xl"
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Delegating...
            </>
          ) : (
            <>
              <Rocket className="w-5 h-5" />
              Delegate to OpenClaw
              <ChevronRight className="w-4 h-4 ml-1" />
            </>
          )}
        </Button>

        <p className="text-center text-[11px] text-zinc-600">
          One signature · Session expires in 7 days · Fully revocable
        </p>

        {/* ─── SECURITY INFO ──────────────────────────── */}
        <div className="p-4 rounded-lg bg-surface border border-[var(--border)]">
          <p className="text-xs font-medium text-zinc-400 mb-2.5 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-orange-400/60" />
            Security Guarantees
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              'Agent cannot transfer funds externally',
              'Session key expires in 7 days',
              'Operations restricted to yield optimization',
              'All transactions verifiable on BscScan',
            ].map((item) => (
              <div key={item} className="flex items-center gap-2 text-xs text-zinc-500">
                <CheckCircle2 className="w-3 h-3 text-orange-400/50 shrink-0" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}