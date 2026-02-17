'use client';

import { motion, useScroll, useTransform } from 'framer-motion';
import {
  Shield,
  Brain,
  Zap,
  Lock,
  TrendingUp,
  BarChart3,
  ArrowRight,
  ChevronDown,
  Activity,
  Layers,
  RefreshCw,
  Eye,
} from 'lucide-react';
import { useRef } from 'react';
import { FlowCapLogo, FlowCapWordmark } from '../components/FlowCapLogo';

// ─── Animation Variants ──────────────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] },
  }),
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

// ─── Subtle Grid Particles ──────────────────────────────────────────
function GridParticles() {
  const dots = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    delay: Math.random() * 4,
    duration: Math.random() * 8 + 12,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {dots.map((d) => (
        <motion.div
          key={d.id}
          className="absolute w-1 h-1 rounded-full bg-orange-500/20"
          style={{ left: `${d.x}%`, top: `${d.y}%` }}
          animate={{ opacity: [0.1, 0.35, 0.1], scale: [1, 1.5, 1] }}
          transition={{ duration: d.duration, delay: d.delay, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

// ─── Stat Counter ────────────────────────────────────────────────────
function StatCard({ value, label, suffix = '', delay = 0 }: { value: string; label: string; suffix?: string; delay?: number }) {
  return (
    <motion.div variants={fadeUp} custom={delay} className="text-center px-4">
      <div className="text-2xl md:text-3xl font-bold text-white font-mono-nums tracking-tight">
        {value}
        {suffix && <span className="text-orange-500/60 text-xl">{suffix}</span>}
      </div>
      <div className="text-xs text-zinc-500 mt-1.5 uppercase tracking-wider">{label}</div>
    </motion.div>
  );
}

// ─── Feature Card ────────────────────────────────────────────────────
function FeatureCard({ icon: Icon, title, description, delay = 0 }: { icon: React.ElementType; title: string; description: string; delay?: number }) {
  return (
    <motion.div
      variants={fadeUp}
      custom={delay}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      className="group relative p-6 rounded-xl bg-surface border border-[var(--border)] hover:border-orange-500/20 transition-all duration-300"
    >
      <div className="w-10 h-10 rounded-lg bg-orange-500/8 flex items-center justify-center mb-4 group-hover:bg-orange-500/12 transition-colors">
        <Icon className="w-5 h-5 text-orange-400/80" />
      </div>
      <h3 className="text-[15px] font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-zinc-500 leading-relaxed">{description}</p>
    </motion.div>
  );
}

// ─── Protocol Row ────────────────────────────────────────────────────
function ProtocolRow({ name, type, pools, delay = 0 }: { name: string; type: string; pools: string; delay?: number }) {
  return (
    <motion.div
      variants={fadeUp}
      custom={delay}
      className="flex items-center justify-between p-4 rounded-lg bg-surface border border-[var(--border)] hover:border-[var(--border-hover)] transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-md bg-orange-500/8 flex items-center justify-center">
          <Layers className="w-4 h-4 text-orange-400/70" />
        </div>
        <div>
          <div className="text-sm font-medium text-white">{name}</div>
          <div className="text-xs text-zinc-500">{type}</div>
        </div>
      </div>
      <span className="text-xs text-zinc-500 font-mono-nums bg-surface-2 px-2.5 py-1 rounded-md border border-[var(--border)]">
        {pools}
      </span>
    </motion.div>
  );
}

// ─── Step Card ───────────────────────────────────────────────────────
function StepCard({ step, title, description, delay = 0 }: { step: string; title: string; description: string; delay?: number }) {
  return (
    <motion.div variants={fadeUp} custom={delay} className="relative flex gap-4">
      <div className="flex flex-col items-center">
        <div className="w-9 h-9 rounded-full bg-surface border border-orange-500/20 flex items-center justify-center text-orange-400/80 font-bold text-xs shrink-0 font-mono-nums">
          {step}
        </div>
        <div className="w-px h-full bg-gradient-to-b from-[var(--border)] to-transparent mt-2" />
      </div>
      <div className="pb-10">
        <h4 className="font-medium text-white text-sm mb-1">{title}</h4>
        <p className="text-sm text-zinc-500 leading-relaxed">{description}</p>
      </div>
    </motion.div>
  );
}

// ─── Live Terminal ───────────────────────────────────────────────────
function LiveTerminal() {
  const lines = [
    { text: '$ openclaw start --risk low', color: 'text-zinc-400', delay: 0 },
    { text: '→ Session key generated (7d expiry)', color: 'text-orange-400/80', delay: 0.8 },
    { text: '→ Connected to BNB Chain', color: 'text-orange-400/80', delay: 1.4 },
    { text: '', color: '', delay: 1.8 },
    { text: 'Scanning 77 pools across 4 protocols...', color: 'text-zinc-300', delay: 2.2 },
    { text: '  Venus  17 markets   PancakeSwap  39 pools', color: 'text-zinc-600', delay: 2.8 },
    { text: '  Lista  21 pools     Alpaca        0 pools', color: 'text-zinc-600', delay: 3.2 },
    { text: '', color: '', delay: 3.6 },
    { text: 'Risk-filtered: 14 pools (LOW)', color: 'text-zinc-300', delay: 4 },
    { text: 'Best: Lista Lending — 16.20% APY', color: 'text-orange-400', delay: 4.6 },
    { text: '  VaR(5%): -2.3%  P(loss): 8.1%', color: 'text-zinc-600', delay: 5.2 },
    { text: '', color: '', delay: 5.6 },
    { text: '→ Position optimized. Next scan in 5m', color: 'text-orange-400/80', delay: 6 },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.6 }}
      className="relative rounded-xl overflow-hidden border border-[var(--border)] glow"
    >
      <div className="flex items-center gap-1.5 px-4 py-3 bg-surface border-b border-[var(--border)]">
        <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
        <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
        <div className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
        <span className="ml-3 text-[11px] text-zinc-600 font-mono">openclaw-agent — zsh</span>
      </div>
      <div className="bg-bg p-5 font-mono text-[13px] leading-6 min-h-[320px]">
        {lines.map((line, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: line.delay, duration: 0.4 }}
            className={line.color}
          >
            {line.text || '\u00A0'}
          </motion.div>
        ))}
        <motion.span
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.8, repeat: Infinity, repeatType: 'reverse' }}
          className="inline-block w-2 h-4 bg-orange-500/60 ml-1 mt-1"
        />
      </div>
    </motion.div>
  );
}

// ─── DeFi Flow Diagram ──────────────────────────────────────────────
function FlowDiagram() {
  const steps = [
    { label: 'Wallet', sub: 'ERC-4337' },
    { label: 'Session Key', sub: 'Restricted' },
    { label: 'OpenClaw', sub: 'AI Agent' },
    { label: 'DeFi Protocols', sub: '4 Protocols' },
  ];

  return (
    <div className="flex items-center justify-center gap-0 w-full max-w-2xl mx-auto">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.15, duration: 0.4 }}
            className="flex flex-col items-center"
          >
            <div className="w-16 h-16 md:w-20 md:h-20 rounded-xl bg-surface border border-[var(--border)] flex items-center justify-center mb-2">
              <span className="text-xs md:text-sm font-medium text-white text-center leading-tight">{s.label}</span>
            </div>
            <span className="text-[10px] text-zinc-600">{s.sub}</span>
          </motion.div>
          {i < steps.length - 1 && (
            <motion.div
              initial={{ opacity: 0, scaleX: 0 }}
              whileInView={{ opacity: 1, scaleX: 1 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15 + 0.1, duration: 0.3 }}
              className="w-8 md:w-12 h-px bg-gradient-to-r from-orange-500/30 to-orange-500/10 mx-1 mb-5"
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Security Permissions Table ──────────────────────────────────────
function PermissionsTable() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="rounded-xl bg-surface border border-[var(--border)] overflow-hidden"
    >
      <div className="px-5 py-3 border-b border-[var(--border)]">
        <h4 className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Session Key Permissions</h4>
      </div>
      <div className="divide-y divide-[var(--border)]">
        {[
          { fn: 'swap()', status: 'Allowed', allowed: true },
          { fn: 'mint() / redeem()', status: 'Allowed', allowed: true },
          { fn: 'approve()', status: 'Allowed', allowed: true },
          { fn: 'transfer()', status: 'Blocked', allowed: false },
          { fn: 'transferFrom()', status: 'Blocked', allowed: false },
        ].map((row) => (
          <div key={row.fn} className="flex items-center justify-between px-5 py-3">
            <span className="text-sm font-mono text-zinc-400">{row.fn}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded ${row.allowed ? 'text-orange-400 bg-orange-500/8' : 'text-zinc-500 bg-zinc-800/50'}`}>
              {row.status}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ─── Risk Profile Comparison ─────────────────────────────────────────
function RiskComparison() {
  const profiles = [
    {
      name: 'Conservative',
      tokens: 'USDT, USDC, BUSD',
      protocols: 'Venus, Lista',
      maxDelegation: '$5,000',
      slippage: '0.5%',
      intensity: 'low',
    },
    {
      name: 'Balanced',
      tokens: '+ BNB, WBNB',
      protocols: '+ PancakeSwap',
      maxDelegation: '$10,000',
      slippage: '1.0%',
      intensity: 'mid',
      popular: true,
    },
    {
      name: 'Aggressive',
      tokens: '+ ETH, BTCB, CAKE',
      protocols: '+ Alpaca',
      maxDelegation: '$50,000',
      slippage: '2.0%',
      intensity: 'high',
    },
  ];

  const intensityClasses = {
    low: 'border-zinc-700/50 hover:border-zinc-600',
    mid: 'border-orange-500/20 hover:border-orange-500/40',
    high: 'border-zinc-700/50 hover:border-zinc-600',
  };

  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      variants={stagger}
      className="grid md:grid-cols-3 gap-4"
    >
      {profiles.map((p, i) => (
        <motion.div
          key={p.name}
          variants={fadeUp}
          custom={i}
          className={`relative p-6 rounded-xl bg-surface border transition-colors ${intensityClasses[p.intensity as keyof typeof intensityClasses]}`}
        >
          {p.popular && (
            <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-orange-500 text-[10px] font-semibold text-white uppercase tracking-wider">
              Popular
            </div>
          )}
          <h3 className={`text-sm font-semibold mb-4 ${p.intensity === 'mid' ? 'text-orange-400' : 'text-white'}`}>
            {p.name}
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-500">Tokens</span>
              <span className="text-zinc-300 text-right text-xs">{p.tokens}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Protocols</span>
              <span className="text-zinc-300 text-right text-xs">{p.protocols}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Max Delegation</span>
              <span className="text-white font-mono-nums font-medium">{p.maxDelegation}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Max Slippage</span>
              <span className="text-zinc-300 font-mono-nums">{p.slippage}</span>
            </div>
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════
export default function LandingPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll();
  const heroOpacity = useTransform(scrollYProgress, [0, 0.12], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 0.12], [1, 0.97]);

  return (
    <div className="relative bg-bg">
      {/* ── NAVBAR ─── */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="fixed top-0 left-0 right-0 z-50 glass-strong"
      >
        <div className="max-w-6xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <FlowCapWordmark size={44} />
          <div className="hidden md:flex items-center gap-8 text-[13px] text-zinc-500">
            <a href="#features" className="hover:text-zinc-200 transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-zinc-200 transition-colors">How it works</a>
            <a href="#security" className="hover:text-zinc-200 transition-colors">Security</a>
            <a href="#protocols" className="hover:text-zinc-200 transition-colors">Protocols</a>
          </div>
          <a
            href="/dashboard"
            className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-400 transition-colors"
          >
            Launch App
          </a>
        </div>
      </motion.nav>

      {/* ── HERO ─── */}
      <motion.section
        ref={heroRef}
        style={{ opacity: heroOpacity, scale: heroScale }}
        className="relative min-h-screen flex items-center justify-center overflow-hidden"
      >
        <div className="absolute inset-0 bg-grid" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-orange-500/[0.03] blur-[100px]" />
        <GridParticles />

        <div className="relative z-10 max-w-4xl mx-auto px-6 text-center pt-20">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface border border-[var(--border)] text-[11px] text-zinc-500 mb-8"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse-dot" />
            Built for BNB Chain Hackathon
          </motion.div>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.7 }}
            className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.05] mb-6"
          >
            <span className="gradient-text-white">Your OpenClaw</span>
            <br />
            <span className="gradient-text text-glow">Wealth Manager</span>
            <br />
            <span className="gradient-text-white">for DeFi</span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="text-base md:text-lg text-zinc-500 max-w-xl mx-auto mb-4 leading-relaxed"
          >
            OpenClaw agent that autonomously optimizes your DeFi yields on BNB Chain 24/7.
            Non-custodial. Secured by ERC-4337 session keys.
          </motion.p>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="text-xs text-orange-400/70 font-medium tracking-[0.2em] uppercase mb-10"
          >
            One Click · One Signature · Zero Configuration
          </motion.p>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-3"
          >
            <a
              href="/dashboard"
              className="group px-7 py-3 rounded-lg bg-orange-500 text-white font-medium text-sm flex items-center gap-2 hover:bg-orange-400 transition-colors glow-strong"
            >
              Launch Dashboard
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </a>
            <a
              href="https://github.com/flowCap-ai/monorepo"
              target="_blank"
              rel="noopener noreferrer"
              className="px-7 py-3 rounded-lg bg-surface border border-[var(--border)] text-zinc-400 font-medium text-sm hover:text-white hover:border-[var(--border-hover)] transition-all"
            >
              View on GitHub
            </a>
          </motion.div>

          {/* Stats */}
          <motion.div
            variants={stagger}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-20 pt-8 border-t border-[var(--border)]"
          >
            <StatCard value="70" suffix="+" label="Pools Monitored" delay={0} />
            <StatCard value="4" label="Protocols" delay={1} />
            <StatCard value="24/7" label="Autonomous" delay={2} />
            <StatCard value="1000" suffix="+" label="Simulations / Pool" delay={3} />
          </motion.div>

          <motion.div
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="mt-14"
          >
            <ChevronDown className="w-5 h-5 text-zinc-700 mx-auto" />
          </motion.div>
        </div>
      </motion.section>

      {/* ── ARCHITECTURE FLOW ─── */}
      <section className="relative py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="text-center mb-12"
          >
            <motion.p variants={fadeUp} className="text-xs text-orange-400/70 font-medium tracking-[0.2em] uppercase mb-3">
              Architecture
            </motion.p>
            <motion.h2 variants={fadeUp} custom={1} className="text-3xl md:text-4xl font-bold text-white tracking-tight">
              How Capital Flows
            </motion.h2>
            <motion.p variants={fadeUp} custom={2} className="text-zinc-500 mt-3 max-w-lg mx-auto text-sm">
              From your wallet to optimized DeFi positions — fully non-custodial
            </motion.p>
          </motion.div>
          <FlowDiagram />
        </div>
      </section>

      {/* ── FEATURES ─── */}
      <section id="features" className="relative py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="text-center mb-14"
          >
            <motion.p variants={fadeUp} className="text-xs text-orange-400/70 font-medium tracking-[0.2em] uppercase mb-3">
              Features
            </motion.p>
            <motion.h2 variants={fadeUp} custom={1} className="text-3xl md:text-4xl font-bold text-white tracking-tight">
              Intelligent DeFi Management
            </motion.h2>
            <motion.p variants={fadeUp} custom={2} className="text-zinc-500 mt-3 max-w-lg mx-auto text-sm">
              Powered by OpenClaw autonomous agents and advanced financial modeling
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="grid md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            <FeatureCard icon={Brain} title="OpenClaw Agent" description="OpenClaw autonomous agent analyzes opportunities using Claude 3.5 Sonnet with conservative temperature (0.3) for reliable financial decisions. Scans every 5 minutes." delay={0} />
            <FeatureCard icon={BarChart3} title="Monte Carlo Engine" description="1,000+ simulation runs with log-normal distribution, VaR 5%, impermanent loss modeling, and sensitivity analysis." delay={1} />
            <FeatureCard icon={Shield} title="Non-Custodial Security" description="ERC-4337 session keys with transfer() explicitly blocked. Your funds stay in your smart account." delay={2} />
            <FeatureCard icon={Zap} title="One-Click Setup" description="Connect wallet, select risk profile, sign once. No configuration files, servers, or technical knowledge." delay={3} />
            <FeatureCard icon={RefreshCw} title="Dynamic Reallocation" description="Automated withdraw → swap → approve → supply. Only executes when 7-day profit exceeds gas + 1%." delay={4} />
            <FeatureCard icon={Eye} title="Full Transparency" description="Every transaction on-chain and verifiable. All agent decisions logged with reasoning. Pause anytime." delay={5} />
          </motion.div>
        </div>
      </section>

      {/* ── TERMINAL DEMO ─── */}
      <section className="relative py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
            >
              <motion.p variants={fadeUp} className="text-xs text-orange-400/70 font-medium tracking-[0.2em] uppercase mb-3">
                OpenClaw Agent
              </motion.p>
              <motion.h2 variants={fadeUp} custom={1} className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-5">
                Watch OpenClaw
                <br />
                <span className="gradient-text">Work in Real-Time</span>
              </motion.h2>
              <motion.p variants={fadeUp} custom={2} className="text-zinc-500 text-sm leading-relaxed mb-6">
                Your OpenClaw agent scans 70+ pools across Venus, PancakeSwap,
                Lista DAO, and Alpaca Finance every 5 minutes. It filters by your
                risk profile, runs Monte Carlo simulations, and only acts when
                profitable.
              </motion.p>
              <motion.div variants={fadeUp} custom={3} className="flex flex-col gap-2.5">
                <div className="flex items-center gap-3 text-sm text-zinc-400">
                  <Activity className="w-4 h-4 text-orange-400/60 shrink-0" />
                  5-minute scan cycle with profitability check
                </div>
                <div className="flex items-center gap-3 text-sm text-zinc-400">
                  <BarChart3 className="w-4 h-4 text-orange-400/60 shrink-0" />
                  VaR(5%) and probability of loss for every pool
                </div>
                <div className="flex items-center gap-3 text-sm text-zinc-400">
                  <Lock className="w-4 h-4 text-orange-400/60 shrink-0" />
                  All operations restricted by session key
                </div>
              </motion.div>
            </motion.div>
            <LiveTerminal />
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─── */}
      <section id="how-it-works" className="relative py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-14 items-start">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={stagger}
            >
              <motion.p variants={fadeUp} className="text-xs text-orange-400/70 font-medium tracking-[0.2em] uppercase mb-3">
                How It Works
              </motion.p>
              <motion.h2 variants={fadeUp} custom={1} className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-10">
                Start in <span className="gradient-text">30 Seconds</span>
              </motion.h2>

              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={stagger}
              >
                <StepCard step="01" title="Connect Your Wallet" description="Open the dashboard and connect via RainbowKit. Supports all major wallets on BNB Chain." delay={0} />
                <StepCard step="02" title="Choose Risk Profile" description="Conservative (stablecoins), Balanced (+ BNB), or Aggressive (all). This defines agent boundaries." delay={1} />
                <StepCard step="03" title="Sign Once" description="One signature creates a restricted session key (ERC-4337). Agent optimizes yields but cannot transfer funds." delay={2} />
                <StepCard step="04" title="Close & Relax" description="The OpenClaw agent runs 24/7 autonomously. Scans, analyzes, and reallocates only when math confirms profitability." delay={3} />
              </motion.div>
            </motion.div>

            {/* Permissions table */}
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="lg:sticky lg:top-28 space-y-6"
            >
              <PermissionsTable />
              <div className="p-5 rounded-xl bg-surface border border-[var(--border)]">
                <p className="text-xs text-zinc-400 font-medium uppercase tracking-wider mb-3">Security Guarantees</p>
                <div className="space-y-2">
                  {[
                    'Agent cannot transfer funds externally',
                    'Session key expires in 7 days',
                    'Operations restricted to yield optimization',
                    'All transactions verifiable on BscScan',
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-2 text-xs text-zinc-500">
                      <Shield className="w-3 h-3 text-orange-400/50 shrink-0" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── RISK PROFILES ─── */}
      <section id="security" className="relative py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="text-center mb-14"
          >
            <motion.p variants={fadeUp} className="text-xs text-orange-400/70 font-medium tracking-[0.2em] uppercase mb-3">
              Risk Profiles
            </motion.p>
            <motion.h2 variants={fadeUp} custom={1} className="text-3xl md:text-4xl font-bold text-white tracking-tight">
              Trustless by Design
            </motion.h2>
            <motion.p variants={fadeUp} custom={2} className="text-zinc-500 mt-3 max-w-lg mx-auto text-sm">
              The agent physically cannot steal your funds. Choose your risk level.
            </motion.p>
          </motion.div>
          <RiskComparison />
        </div>
      </section>

      {/* ── PROTOCOLS ─── */}
      <section id="protocols" className="relative py-24 px-6">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="text-center mb-12"
          >
            <motion.p variants={fadeUp} className="text-xs text-orange-400/70 font-medium tracking-[0.2em] uppercase mb-3">
              Integrations
            </motion.p>
            <motion.h2 variants={fadeUp} custom={1} className="text-3xl md:text-4xl font-bold text-white tracking-tight">
              Multi-Protocol Coverage
            </motion.h2>
            <motion.p variants={fadeUp} custom={2} className="text-zinc-500 mt-3 text-sm">
              Real-time data from 5 sources, scanning across 4 protocols
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="space-y-3"
          >
            <ProtocolRow name="Venus Protocol" type="Lending / Borrowing" pools="17 markets" delay={0} />
            <ProtocolRow name="PancakeSwap" type="DEX — V2 & V3" pools="39 pools" delay={1} />
            <ProtocolRow name="Lista DAO" type="Lending / Liquid Staking / CDP" pools="21 pools" delay={2} />
            <ProtocolRow name="Alpaca Finance" type="Leveraged Yield Farming" pools="Variable" delay={3} />
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="mt-8 flex flex-wrap justify-center gap-2"
          >
            {['Venus API', 'DeFiLlama', 'CoinGecko', 'DexScreener', 'Owlracle'].map((src, i) => (
              <motion.div
                key={src}
                variants={fadeUp}
                custom={i}
                className="px-3 py-1.5 rounded-md bg-surface border border-[var(--border)] text-[11px] text-zinc-500 font-medium"
              >
                {src}
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── CTA ─── */}
      <section className="relative py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
          >
            <motion.h2
              variants={fadeUp}
              className="text-3xl md:text-5xl font-bold tracking-tight mb-5"
            >
              <span className="gradient-text-white">Ready to Let OpenClaw</span>
              <br />
              <span className="gradient-text text-glow">Manage Your Yields?</span>
            </motion.h2>
            <motion.p variants={fadeUp} custom={1} className="text-zinc-500 text-sm max-w-md mx-auto mb-8">
              One click, one signature. Your OpenClaw agent starts
              working in 30 seconds.
            </motion.p>
            <motion.div variants={fadeUp} custom={2} className="flex justify-center">
              <a
                href="/dashboard"
                className="group px-8 py-3.5 rounded-lg bg-orange-500 text-white font-medium flex items-center gap-2 hover:bg-orange-400 transition-colors glow-strong"
              >
                Launch Dashboard
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </a>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── FOOTER ─── */}
      <footer className="border-t border-[var(--border)] py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <FlowCapLogo size={24} />
            <span className="text-xs text-zinc-600">
              CustoFi by <span className="text-zinc-400">HashFox Labs</span>
            </span>
          </div>
          <div className="flex items-center gap-6 text-xs text-zinc-600">
            <a href="https://github.com/flowCap-ai/monorepo" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-300 transition-colors">
              GitHub
            </a>
            <a href="/dashboard" className="hover:text-zinc-300 transition-colors">
              Dashboard
            </a>
            <span>BNB Chain Hackathon</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
