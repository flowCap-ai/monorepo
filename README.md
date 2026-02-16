# FlowCap - Autonomous DeFi Wealth Manager

**Status: ✅ AGENT RUNNING - Autonomous monitoring active**

FlowCap is an autonomous AI agent that optimizes DeFi yields on BNB Chain using Biconomy session keys (ERC-4337) and OpenClaw for 24/7 monitoring.

---

## 🎯 Current Progress

### ✅ What's Working

1. **Agent Core** - Fully functional autonomous monitoring
   - ✅ Loads `soul.md` AI personality
   - ✅ Watches `/Users/alex/.openclaw/flowcap-delegations/` for new delegations
   - ✅ Auto-starts when delegation file detected
   - ✅ Scans BNB Chain every 5 minutes for yield opportunities
   - ✅ Finds 14+ pools matching risk profile
   - ✅ Identifies best opportunities (currently: Lista Lending at 16.20% APY)

2. **Skills Implementation**
   - ✅ `getPools` - Discovers Venus, PancakeSwap, Lista, Alpaca pools
   - ✅ `analyzePool` - Analyzes APY, TVL, risk scores
   - ✅ `analyzePool-LPV2` - Advanced mathematical modeling for PancakeSwap V2
   - ✅ `execSwap` - Multi-step reallocation (withdraw → swap → supply)
   - ✅ Session key delegation from dashboard

3. **Dashboard**
   - ✅ Wallet connection (RainbowKit + Wagmi)
   - ✅ Session key delegation via Biconomy SDK
   - ✅ Saves delegations to `/Users/alex/.openclaw/flowcap-delegations/`
   - ✅ Risk profile selection (low/medium/high)

### ⚠️ Known Issues

1. **OpenClaw Gateway Connection** - Not critical, agent works standalone
   - ❌ WebSocket connection to `ws://127.0.0.1:18789` fails with "gateway token mismatch"
   - ℹ️ This is optional - agent runs fine without gateway
   - ℹ️ Gateway is only needed for dashboard real-time updates

2. **Transaction Execution** - Not yet tested on-chain
   - ⏳ Reallocation logic implemented but needs live testing
   - ⏳ Gas profitability checks need validation
   - ⏳ Biconomy MEE bundler integration needs testing

---

## 📁 Project Structure

```
monorepo/
├── agents/                    # Autonomous agent (Node.js)
│   ├── start-agent.ts        # Main entry point ⭐ START HERE
│   ├── index.ts              # Agent logic (scanAndOptimize)
│   ├── soul.md               # AI personality & instructions
│   ├── skills/               # Agent capabilities
│   │   ├── getPools.ts       # Pool discovery (Venus, PancakeSwap, etc.)
│   │   ├── analyzePool.ts    # Generic pool analysis
│   │   ├── analyzePool-LPV2.ts  # Advanced LP V2 math
│   │   ├── getPriceHistory.ts   # Historical prices for IL calc
│   │   ├── execSwap.ts       # Transaction execution
│   │   └── flowcap-monitor.ts   # Monitoring skill
│   ├── config.yaml           # Strategy configuration
│   └── package.json          # Dependencies
│
├── dashboard/                # Next.js frontend
│   ├── app/                  # App router pages
│   ├── components/           # React components
│   │   └── FlowCapDashboard.tsx  # Main UI
│   ├── lib/                  # Utilities
│   │   └── biconomyClient.ts     # Session key delegation
│   ├── server.ts             # WebSocket proxy (optional)
│   └── package.json
│
└── .env                      # Environment variables
```

---

## 🚀 How to Run Everything

### Prerequisites

```bash
# Install dependencies
npm install  # in root if needed
cd agents && npm install
cd ../dashboard && npm install
```

### 1. Start the OpenClaw Gateway (Optional)

The gateway is running at `ws://127.0.0.1:18789` but connection is currently failing. **The agent works without it.**

### 2. Start the Agent ⭐

```bash
cd /Users/alex/Desktop/HASHFOXLABS/FlowCap/monorepo/agents
npm start
```

**Expected Output:**
```
╔════════════════════════════════════════════════════════════╗
║                  FlowCap Agent Starting                    ║
╚════════════════════════════════════════════════════════════╝

📖 Loaded soul.md (18202 characters)

👀 Watching folder: /Users/alex/.openclaw/flowcap-delegations
📬 Found 7 existing delegation file(s)
📄 Loading most recent delegation: active.json
   Using most recent delegation from 2/16/2026, 11:38:20 PM

📋 Processing delegation...
   Smart Account: 0x8Bde63fcd2719Bf38f9F3B252735f0ddaCB2eCeD
   Risk Profile: low
   Session Key: 0xf607f479...a3b6

🚀 Initializing FlowCap Agent...
✅ Agent initialized for 0x8Bde63fcd2719Bf38f9F3B252735f0ddaCB2eCeD
   Risk Profile: low

✅ Agent initialized successfully

🤖 Starting autonomous monitoring...
   Check interval: 5 minutes

[2026-02-16T16:10:30.255Z] 🔍 Running autonomous scan...
🔍 Scanning for yield opportunities...
Discovered 17 Venus Core Pool markets
Discovered 0 Alpaca pools
Discovered 21 Lista pools
Discovered 39 PancakeSwap pools
   Found 14 pools matching low risk profile
   Best opportunity: lista-lending at 16.20% APY
   No existing positions. Consider starting with lista-lending
   Result: none - Best pool: lista-lending at 16.20% APY

⏳ Next scan in 5 minutes...
────────────────────────────────────────────────────────────
```

### 3. Start the Dashboard (Optional - for creating new delegations)

```bash
cd /Users/alex/Desktop/HASHFOXLABS/FlowCap/monorepo/dashboard
npm run dev
```

Open http://localhost:3000

**Dashboard Actions:**
1. Connect wallet
2. Select risk profile (low/medium/high)
3. Set max investment amount
4. Click "Start Agent" → Creates session key delegation
5. Delegation saved to `/Users/alex/.openclaw/flowcap-delegations/`
6. Agent auto-detects and starts monitoring

---

## 🧪 Testing

### Test 1: Agent Discovers Pools
```bash
cd agents
npm start
# Watch for "Discovered X pools" messages
# Should find Venus, Lista, PancakeSwap pools
```

**Expected:** Agent finds 70+ total pools across all protocols

### Test 2: Pool Analysis
```bash
# Agent automatically analyzes top pools
# Check logs for APY calculations
```

**Expected:** APY values calculated for Venus (2-3%), Lista (15-20%), PancakeSwap (varies)

### Test 3: Risk Filtering
```bash
# Agent filters by risk profile (currently: low)
# Low risk = only stablecoins (USDT, USDC, BUSD)
```

**Expected:** ~14 pools pass low-risk filter

### Test 4: Reallocation Decision
The agent checks:
- ✅ Minimum APY improvement: 1%
- ✅ Minimum holding period: 7 days
- ✅ Gas profitability: 7-day gain > gas cost + 1%

**Expected:** Agent logs recommendation but doesn't execute yet (no existing positions)

### Test 5: Session Key Delegation (Dashboard)
```bash
cd dashboard
npm run dev
# Open browser, connect wallet, create delegation
```

**Expected:** File created in `/Users/alex/.openclaw/flowcap-delegations/`

---

## 🔧 Configuration

### Environment Variables

**`.env` (Root - for both agent and dashboard)**
```bash
# BNB Chain
BNB_RPC_URL=https://1rpc.io/bnb
BNB_CHAIN_ID=56

# Biconomy
BICONOMY_API_KEY=mee_4Z4ms1rVVK6d2aCTihwrQS

# AI Model
ANTHROPIC_API_KEY=sk-ant-api03-...
AI_MODEL=claude-3-5-sonnet-20241022

# Protocol Addresses
VENUS_COMPTROLLER=0xfD36E2c2a6789Db23113685031d7F16329158384
PANCAKESWAP_ROUTER_V2=0x10ED43C718714eb63d5aA57B78B54704E256024E
PANCAKESWAP_ROUTER_V3=0x13f4EA83D0bd40E75C8222255bc855a974568Dd4

# Strategy
MIN_PROFIT_THRESHOLD_PERCENT=1
REALLOCATION_CHECK_INTERVAL_MS=300000  # 5 minutes
MIN_HOLDING_PERIOD_DAYS=7
```

### Agent Strategy (`agents/config.yaml`)
```yaml
agent:
  name: FlowCap
  version: 1.0.0

strategy:
  minAPYImprovement: 1        # Minimum 1% APY gain to reallocate
  minHoldingPeriod: 7         # Hold positions for 7 days minimum
  checkInterval: 300000       # Scan every 5 minutes
  maxGasPrice: 5              # Max 5 Gwei

riskProfiles:
  low:
    name: Prudent
    allowedProtocols: [venus, lista]
    allowedTokens: [USDT, USDC, BUSD]
    maxSlippage: 0.5

  medium:
    name: Moderate
    allowedProtocols: [venus, lista, pancakeswap]
    allowedTokens: [USDT, USDC, BUSD, BNB, WBNB]
    maxSlippage: 1.0

  high:
    name: Aggressive
    allowedProtocols: [venus, lista, pancakeswap, alpaca]
    allowedTokens: [USDT, USDC, BUSD, BNB, WBNB, ETH, BTCB, CAKE]
    maxSlippage: 2.0
```

---

## 🛠️ Troubleshooting

### Agent Not Starting
```bash
# Check dependencies
cd agents
npm install

# Check .env file exists
ls -la ../.env

# Check delegation folder exists
ls -la /Users/alex/.openclaw/flowcap-delegations/
```

### No Pools Found
```bash
# Check RPC connection
curl https://1rpc.io/bnb -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# Should return current block number
```

### Gateway Connection Failing
```bash
# This is expected and non-critical
# Agent works without gateway connection
# Gateway is only for dashboard real-time updates
```

### Dashboard Can't Connect Wallet
```bash
# Check NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is set
# Get from https://cloud.walletconnect.com
```

---

## 📊 Current Test Results

**Last Scan (2026-02-16 16:10:30):**
- ✅ Total Pools Discovered: 77
  - Venus: 17 markets
  - Lista: 21 pools
  - PancakeSwap: 39 pools
  - Alpaca: 0 pools (API may be down)
- ✅ Risk-Filtered Pools: 14 (low risk profile)
- ✅ Best Opportunity: Lista Lending at 16.20% APY
- ✅ Agent Decision: Recommend Lista but no execution (no existing position)

**Smart Account:**
- Address: `0x8Bde63fcd2719Bf38f9F3B252735f0ddaCB2eCeD`
- Session Key: `0xf607f4797db72ec90e5ebd0d6c14f173f417a7f7331672416ae385f3ef69a3b6`
- Risk Profile: Low (stablecoins only)
- Max Investment: 1 BNB

---

## 🔜 Next Steps

1. **Fix OpenClaw Gateway Connection** (Optional)
   - Resolve "gateway token mismatch" error
   - Enable real-time dashboard updates

2. **Test Live Transaction Execution**
   - Fund smart account with small amount (e.g., 10 USDT)
   - Create initial position manually
   - Wait for agent to find better opportunity
   - Verify agent executes reallocation

3. **Add More Skills**
   - `analyzePool-LPV3` - PancakeSwap V3 concentrated liquidity
   - `analyzePool-Lending` - Enhanced Venus/Lista analysis
   - Monte Carlo simulation integration

4. **Dashboard Enhancements**
   - Real-time position tracking
   - Transaction history
   - Performance analytics

---

## 📝 Notes

- **Agent runs standalone** - No OpenClaw gateway required
- **Session keys expire** after 7 days - Must re-delegate from dashboard
- **Gas costs** calculated before every transaction
- **All actions** logged to console for transparency
- **No cloud servers** - Everything runs locally on your machine

---

## 🆘 Support

- Agent logs: Check terminal output where `npm start` is running
- Delegation files: `/Users/alex/.openclaw/flowcap-delegations/`
- Configuration: `.env` and `agents/config.yaml`
- Soul personality: `agents/soul.md`

---

**Last Updated:** 2026-02-16 16:15:00
**Status:** ✅ Autonomous monitoring active, scanning every 5 minutes
