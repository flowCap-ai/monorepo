'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import FlowCapDashboard from '../components/FlowCapDashboard';
import { AgentConnector } from '../components/AgentConnector';
import { FlowCapWordmark, FlowCapLogo } from '../components/FlowCapLogo';
import { ThemeToggle } from '../components/ThemeToggle';
import { Card, CardContent } from '../components/ui/card';
import { useAgentEvents } from '../hooks/useAgentEvents';
import {
  Shield,
  Brain,
  Link2,
  ArrowRight,
  Activity,
  Layers,
  Zap,
} from 'lucide-react';

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <Card className="group hover:border-orange-500/15 transition-all duration-300">
      <CardContent className="p-5">
        <div className="w-9 h-9 rounded-lg bg-orange-500/8 flex items-center justify-center mb-3 group-hover:bg-orange-500/12 transition-colors">
          <Icon className="w-4.5 h-4.5 text-orange-400/80" />
        </div>
        <h3 className="font-semibold text-sm text-white mb-1">{title}</h3>
        <p className="text-xs text-zinc-500 leading-relaxed">{description}</p>
      </CardContent>
    </Card>
  );
}

function StepItem({ number, title, desc }: { number: string; title: string; desc: string }) {
  return (
    <div className="flex gap-3.5">
      <div className="flex flex-col items-center">
        <div className="w-7 h-7 rounded-full bg-surface border border-orange-500/15 flex items-center justify-center text-orange-400/70 font-bold text-[10px] shrink-0 font-mono">
          {number}
        </div>
        <div className="w-px h-full bg-gradient-to-b from-[var(--border)] to-transparent mt-1.5" />
      </div>
      <div className="pb-6">
        <h4 className="font-medium text-white text-sm mb-0.5">{title}</h4>
        <p className="text-xs text-zinc-500 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

export default function Home() {
  const { address } = useAccount();
  const agent = useAgentEvents(address);

  return (
    <div className="min-h-screen bg-bg bg-grid">
      {/* Ambient glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-orange-500/[0.03] rounded-full blur-[100px] pointer-events-none" />

      {/* ─── HEADER ─── */}
      <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-bg/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <FlowCapWordmark size={44} />
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface border border-[var(--border)] text-[11px] text-zinc-500">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse-dot" />
              BNB Chain
            </div>
            <ThemeToggle />
            <ConnectButton />
          </div>
        </div>
      </header>

      {/* ─── MAIN ─── */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Hero */}
        <div className="text-center mb-8 sm:mb-10">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-surface border border-[var(--border)] text-[10px] sm:text-[11px] text-zinc-500 mb-4">
            Powered by OpenClaw AI & Biconomy ERC-4337
          </div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-white tracking-tight mb-2">
            OpenClaw Wealth Manager for DeFi
          </h1>
          <p className="text-[10px] sm:text-xs text-orange-400/60 font-medium tracking-[0.15em] uppercase">
            One Click · One Signature · Zero Configuration
          </p>
        </div>

        {/* Features row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-8 sm:mb-10">
          <FeatureCard
            icon={Shield}
            title="Non-Custodial"
            description="Session keys block transfer(). Agent optimizes yields but can never move funds externally."
          />
          <FeatureCard
            icon={Brain}
            title="OpenClaw Agent"
            description="OpenClaw autonomous agent powered by Claude 3.5 Sonnet analyzes 70+ pools with Monte Carlo simulations every 5 minutes."
          />
          <FeatureCard
            icon={Link2}
            title="On-Chain Verified"
            description="Every transaction verifiable on BscScan. Full transparency, pause or stop anytime."
          />
        </div>

        {/* ─── AGENT CONNECTION ─── */}
        <div className="mb-4">
          <AgentConnector
            walletAddress={address}
            connection={agent.connection}
            connected={agent.connected}
            onConnect={agent.connectAgent}
            onDisconnect={agent.disconnectAgent}
          />
        </div>

        {/* ─── DELEGATION PANEL ─── */}
        <FlowCapDashboard />

        {/* ─── HOW IT WORKS + PROTOCOLS ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-8 sm:mt-10">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Zap className="w-3.5 h-3.5 text-orange-400/70" />
                <h3 className="text-sm font-semibold text-white">How It Works</h3>
              </div>
              <div>
                <StepItem number="01" title="Connect & Configure" desc="Connect your wallet and select your risk profile. No configuration needed." />
                <StepItem number="02" title="Sign Once" desc="A single signature creates a restricted ERC-4337 session key." />
                <StepItem number="03" title="OpenClaw Monitors 24/7" desc="OpenClaw agent scans every 5 min, runs Monte Carlo simulations, acts only when profitable." />
                <div className="flex gap-3.5">
                  <div className="flex flex-col items-center">
                    <div className="w-7 h-7 rounded-full bg-surface border border-orange-500/15 flex items-center justify-center text-orange-400/70 font-bold text-[10px] shrink-0 font-mono">
                      04
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium text-white text-sm mb-0.5">Track in Real-Time</h4>
                    <p className="text-xs text-zinc-500 leading-relaxed">See agent activity live. Pause anytime. Session expires in 7 days.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Layers className="w-3.5 h-3.5 text-orange-400/70" />
                <h3 className="text-sm font-semibold text-white">Supported Protocols</h3>
              </div>
              <div className="space-y-2.5">
                {[
                  { name: 'Venus Protocol', type: 'Lending / Borrowing', pools: '17 markets' },
                  { name: 'PancakeSwap', type: 'DEX — V2 & V3', pools: '39 pools' },
                  { name: 'Lista DAO', type: 'Lending / Staking / CDP', pools: '21 pools' },
                  { name: 'Alpaca Finance', type: 'Leveraged Yield Farming', pools: 'Variable' },
                ].map((proto) => (
                  <div
                    key={proto.name}
                    className="flex items-center justify-between p-3 rounded-lg bg-surface border border-[var(--border)] hover:border-[var(--border-hover)] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-md bg-orange-500/8 flex items-center justify-center">
                        <Activity className="w-3.5 h-3.5 text-orange-400/70" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{proto.name}</p>
                        <p className="text-[11px] text-zinc-500">{proto.type}</p>
                      </div>
                    </div>
                    <span className="text-[11px] text-zinc-500 font-mono bg-surface-2 px-2 py-0.5 rounded border border-[var(--border)]">
                      {proto.pools}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-3.5 border-t border-[var(--border)]">
                <p className="text-[11px] text-zinc-600 mb-2 font-medium uppercase tracking-wider">Data Sources</p>
                <div className="flex flex-wrap gap-1.5">
                  {['Venus API', 'DeFiLlama', 'CoinGecko', 'DexScreener', 'Owlracle'].map((src) => (
                    <span key={src} className="px-2 py-0.5 rounded text-[10px] text-zinc-500 bg-surface border border-[var(--border)]">
                      {src}
                    </span>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-[var(--border)] mt-8 sm:mt-12 py-5 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FlowCapLogo size={20} />
            <span className="text-[11px] text-zinc-600">
              Built by <span className="text-zinc-400">HashFox Labs</span>
            </span>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-zinc-600">
            <a href="https://github.com/flowCap-ai/monorepo" className="hover:text-zinc-300 transition-colors flex items-center gap-1">
              GitHub <ArrowRight className="w-2.5 h-2.5" />
            </a>
            <span>BNB Chain Hackathon</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
