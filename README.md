<p align="center">
  <img src="dashboard/public/hashfoxblack.png" alt="FlowCap" width="120" />
</p>

<h1 align="center">FlowCap</h1>
<p align="center"><strong>Autonomous OpenClaw Wealth Manager for DeFi</strong></p>

<p align="center">
  <em>One Click · One Signature · Zero Configuration</em>
</p>

<p align="center">
  <a href="#architecture">Architecture</a> •
  <a href="#features">Features</a> •
  <a href="#tech-stack">Tech Stack</a> •
  <a href="#getting-started">Getting Started</a> •
  <a href="#security">Security</a> •
  <a href="#team">Team</a>
</p>

---

## The Problem

DeFi yield optimization is **complex, time-consuming, and risky**:

- Users must manually monitor dozens of pools across multiple protocols 24/7
- Rebalancing requires gas estimation, slippage management, and multi-step transactions
- Existing "yield aggregators" are centralized custodial solutions — users lose control of their funds
- No tool combines **AI-driven analysis** with **non-custodial security guarantees**

## Our Solution

**FlowCap** is an autonomous AI agent that manages your DeFi positions on BNB Chain **24/7**, powered by [OpenClaw](https://openclaw.ai) and secured by **Biconomy ERC-4337 session keys**.

The agent **physically cannot steal your funds** — session keys restrict operations to yield optimization only, with `transfer` and `transferFrom` explicitly blocked at the smart contract level.

```
User signs once → Agent monitors every 5 min → Finds better yield → Reallocates automatically
```

### How It Works

```
┌──────────────────────────────────────────────────────────────────────┐
│  USER (Browser)                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  Dashboard (Next.js)                                           │  │
│  │  Connect Wallet → Select Risk → Sign Delegation → Done ✓      │  │
│  └──────────────────────────┬─────────────────────────────────────┘  │
└─────────────────────────────┼────────────────────────────────────────┘
                              │ Session Key (ERC-4337)
┌─────────────────────────────┼────────────────────────────────────────┐
│  AGENT (OpenClaw - Local)   ▼                                        │
│  ┌──────────┐ ┌───────────┐ ┌────────────┐ ┌───────────────────┐    │
│  │ getPools │ │analyzePool│ │ execSwap   │ │ Monte Carlo Sim   │    │
│  │ 4 protos │ │ + LP V2   │ │ multi-step │ │ 1000+ scenarios   │    │
│  └────┬─────┘ └─────┬─────┘ └─────┬──────┘ └─────────┬─────────┘    │
│       │              │             │                  │              │
│  Scan every 5 min → Analyze → Profitability check → Execute        │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ UserOperation (ERC-4337)
┌──────────────────────────────┼───────────────────────────────────────┐
│  BNB CHAIN                   ▼                                       │
│  ┌──────────┐ ┌──────────────┐ ┌──────────┐ ┌────────────────────┐  │
│  │  Venus   │ │ PancakeSwap  │ │  Lista   │ │  Biconomy MEE     │  │
│  │ Lending  │ │   V2 + V3    │ │   DAO    │ │  Bundler+Paymaster│  │
│  └──────────┘ └──────────────┘ └──────────┘ └────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Architecture

### Three Independent Modules

| Module | Purpose | Tech |
|--------|---------|------|
| **Landing Page** (`/landing`) | Public-facing marketing site | Next.js 14, Framer Motion, Tailwind |
| **Dashboard** (`/dashboard`) | Wallet connection, delegation, monitoring | Next.js 14, RainbowKit, Wagmi, Biconomy |
| **Agent** (`/agents`) | Autonomous AI agent with DeFi skills | OpenClaw SDK, Claude 3.5, TypeScript |

### Agent Skills

| Skill | Description |
|-------|-------------|
| `getPools` | Discovers pools across Venus, PancakeSwap V2/V3, Lista DAO, Alpaca Finance |
| `analyzePool` | Calculates APY, TVL, risk scores with protocol-specific logic |
| `analyzePool-LPV2` | **1,100+ lines** — Advanced LP V2 modeling with Monte Carlo simulation (1,000 scenarios), impermanent loss, VaR 5%, sensitivity analysis |
| `getPriceHistory` | Fetches historical prices from CoinGecko for volatility estimation |
| `execSwap` | Multi-step reallocation: withdraw → swap → approve → supply. Full ERC-4337 UserOperation pipeline |
| `flowcap-monitor` | Orchestrates the 5-minute scan loop with intelligent routing |

### Data Sources

Real-time data from **5 independent sources** feeds the mathematical model:

- **Venus API** — On-chain supply rates
- **DeFiLlama** — Cross-protocol yield aggregation  
- **CoinGecko** — Spot & historical prices
- **DexScreener** — DEX volume & liquidity
- **Owlracle** — BSC gas prices

---

## Features

### OpenClaw-Powered Yield Optimization
- Autonomous 24/7 monitoring with scans every 5 minutes
- OpenClaw agent leverages Claude 3.5 Sonnet for decision-making (temperature 0.3 for conservative financial decisions)
- Multi-protocol discovery: **70+ pools** across 4 protocols on BNB Chain
- Dynamic reallocation with gas profitability checks

### Monte Carlo Risk Engine
- **1,000+ simulation runs** using log-normal distribution
- Box-Muller transform for random variable generation
- Maximum Likelihood Estimation (MLE) for parameter fitting
- Metrics: VaR 5%, expected return, probability of loss, optimal harvest frequency
- Sensitivity analysis: ±10% and ±25% price deviation scenarios

### One-Click Delegation
- Single signature to delegate restricted permissions
- No configuration files, no servers, no technical setup
- Risk profile selection: Conservative / Balanced / Aggressive
- Customizable delegation amount ($1 - $50,000)

### Non-Custodial Security (ERC-4337)
- Session keys with **7-day expiration**
- `transfer` and `transferFrom` **explicitly blocked**
- Per-risk-profile contract whitelists
- Rate limiting: 10 tx/hour, 50 tx/day
- Local execution via OpenClaw — no cloud servers

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 14 (App Router), React 18, Tailwind CSS, shadcn/ui, Framer Motion |
| **Wallet** | RainbowKit 2.0, Wagmi 2.5, Viem 2.21 |
| **Account Abstraction** | Biconomy AbstractJS 1.1.21, ERC-4337, MEE Bundler |
| **AI Agent** | OpenClaw SDK (autonomous decision-making), Claude 3.5 Sonnet (Anthropic) |
| **Blockchain** | BNB Chain (BSC, Chain ID 56) |
| **Protocols** | Venus, PancakeSwap V2/V3, Lista DAO, Alpaca Finance |
| **Language** | TypeScript 5.3 |

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- pnpm (for dashboard & landing)
- npm (for agents)

### 1. Clone & Install

```bash
git clone https://github.com/flowCap-ai/monorepo.git
cd monorepo

# Dashboard
cd dashboard && pnpm install

# Landing Page
cd ../landing && pnpm install

# Agent
cd ../agents && npm install
```

### 2. Environment Variables

Create a `.env` file at the root:

```env
# BNB Chain
BNB_RPC_URL=https://1rpc.io/bnb
BNB_CHAIN_ID=56

# Biconomy
BICONOMY_API_KEY=your_api_key
NEXT_PUBLIC_BICONOMY_MEE_API_KEY=your_mee_key

# AI
ANTHROPIC_API_KEY=sk-ant-...
AI_MODEL=claude-3-5-sonnet-20241022

# Protocol Addresses (BSC Mainnet)
VENUS_COMPTROLLER=0xfD36E2c2a6789Db23113685031d7F16329158384
PANCAKESWAP_ROUTER_V2=0x10ED43C718714eb63d5aA57B78B54704E256024E
PANCAKESWAP_ROUTER_V3=0x13f4EA83D0bd40E75C8222255bc855a974568Dd4
```

### 3. Run

```bash
# Terminal 1 — Dashboard
cd dashboard && pnpm dev
# → http://localhost:3000

# Terminal 2 — Landing Page
cd landing && pnpm dev
# → http://localhost:3001

# Terminal 3 — Agent
cd agents && npm start
# → Autonomous monitoring starts
```

### 4. Usage

1. Open the **Dashboard** at `http://localhost:3000`
2. Connect your wallet (BNB Chain)
3. Select your risk profile
4. Set your delegation amount
5. Click **"Delegate to OpenClaw"** and sign once
6. Close the browser — the agent runs autonomously

---

## Security

### Session Key Architecture

```
┌─ Browser ─────────────────────────────────────────────────────┐
│  Generate 32-byte random session key                          │
│  Define permissions based on risk profile                     │
│  User signs delegation message                                │
└────────────────────────────┬──────────────────────────────────┘
                             │
┌─ On-Chain (ERC-4337) ──────┼──────────────────────────────────┐
│  Session key registered via Biconomy Smart Account             │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │ ALLOWED:          │ BLOCKED:                             │  │
│  │ • Venus mint()    │ • transfer() ❌                      │  │
│  │ • Venus redeem()  │ • transferFrom() ❌                  │  │
│  │ • PCS swap()      │ • approve() to unknown contracts ❌  │  │
│  │ • Lista supply()  │ • Any non-whitelisted call ❌        │  │
│  └─────────────────────────────────────────────────────────┘  │
│  Expiration: 7 days                                            │
│  Rate limit: 10 tx/hour, 50 tx/day                             │
└────────────────────────────────────────────────────────────────┘
```

### Risk Profiles

| Profile | Protocols | Tokens | Max Delegation | Slippage |
|---------|-----------|--------|----------------|----------|
| **Conservative** | Venus, Lista | USDT, USDC, BUSD | $5,000 | 0.5% |
| **Balanced** | + PancakeSwap | + BNB, WBNB | $10,000 | 1.0% |
| **Aggressive** | + Alpaca | + ETH, BTCB, CAKE | $50,000 | 2.0% |

### Agent Guardrails

- Minimum APY improvement: **1%** before reallocation
- Minimum holding period: **7 days**
- Gas profitability: 7-day gain must exceed gas + 1% margin
- AI temperature: **0.3** (conservative decision-making)
- All operations logged for transparency

---

## Project Structure

```
monorepo/
├── landing/                   # Marketing landing page
│   ├── app/                   # Next.js App Router
│   │   ├── page.tsx          # Animated landing page
│   │   ├── layout.tsx        # Root layout
│   │   └── globals.css       # Styles + animations
│   └── package.json
│
├── dashboard/                 # DeFi management dashboard
│   ├── app/                   # Next.js App Router
│   │   ├── page.tsx          # Dashboard page
│   │   ├── api/              # API routes
│   │   └── providers.tsx     # Wagmi + RainbowKit
│   ├── components/            # UI components (shadcn/ui)
│   ├── hooks/                 # useBiconomy, useSessionKey
│   ├── lib/                   # Biconomy client, encryption
│   └── package.json
│
├── agents/                    # Autonomous AI agent
│   ├── start-agent.ts        # Entry point
│   ├── index.ts              # Core agent logic
│   ├── soul.md               # AI personality & guardrails
│   ├── skills/               # Agent capabilities
│   └── config.yaml           # Strategy configuration
│
├── contracts/                 # Smart contracts (Solidity)
│   └── SessionValidator.sol
│
└── scripts/                   # Testing & deployment
```

---

## Built With

<p>
  <img src="https://img.shields.io/badge/BNB_Chain-F0B90B?style=for-the-badge&logo=binance&logoColor=white" />
  <img src="https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" />
  <img src="https://img.shields.io/badge/OpenClaw-4B32C3?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Biconomy-FF4E17?style=for-the-badge" />
  <img src="https://img.shields.io/badge/Claude_3.5-CC785C?style=for-the-badge&logo=anthropic&logoColor=white" />
</p>

---

## Team

**HashFox Labs**

---

## License

MIT
