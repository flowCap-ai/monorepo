# FlowCap/CustoFi Monorepo

**Autonomous DeFi Portfolio Manager with AI-Powered Rebalancing**

FlowCap combines AI agents, account abstraction, and mathematical modeling to autonomously manage DeFi positions on BNB Chain. Users delegate control through a dashboard, and the system continuously monitors and optimizes their portfolio.

Note : FlowCap = CustoFi

---

## 🎯 Complete Process Flow

### 1. **User Delegates Control (Dashboard → Server)**

```
User Browser
    ↓ Signs ERC-7715 Permission
    ↓ Creates Session Key (24h)
    ↓
Dashboard (Vercel)
    ↓ POST /api/flowcap/delegate
    ↓
FlowCap Server (Railway)
    ↓ Saves to ~/.openclaw/flowcap-delegations/
    ↓ Creates monitoring instructions
    ↓
OpenClaw Agent (Local/Cloud)
```

**What happens:**
- User connects wallet (Coinbase Smart Wallet)
- Selects risk profile (Low/Medium/High)
- Sets max investment amount
- Signs delegation with session key (24h validity)
- Dashboard sends delegation to server
- Server saves to OpenClaw directory

**Files created:**
```
~/.openclaw/flowcap-delegations/
├── {delegationId}.json          # Full delegation details
├── active.json                  # List of all active delegations
├── monitor-{delegationId}.json  # Monitoring config
└── whatsapp-{delegationId}.txt  # Notification message
```

---

### 2. **AI Agent Monitors Portfolio (OpenClaw → Analysis)**

```
OpenClaw Agent
    ↓ Reads delegation files
    ↓ Every 5 minutes
    ↓
Portfolio Evaluation
    ↓ Loads existing positions
    ↓ Fetches historical prices
    ↓ Calculates correlation matrix
    ↓ Computes portfolio metrics
    ↓
Risk Analysis
    ↓ Portfolio volatility
    ↓ Value at Risk (VaR)
    ↓ Sharpe ratio
    ↓ Diversification benefit
```

**What happens:**
- Agent reads delegation from `~/.openclaw/flowcap-delegations/`
- Scans user's current DeFi positions
- Runs portfolio analysis with correlation matrix
- Identifies optimization opportunities
- Checks if APY improvement meets threshold

**Key files:**
- `agents/skills/PortfolioEvaluation.ts` - Portfolio-level risk analysis
- `agents/skills/analyzePool-LPV2.ts` - LP V2 position modeling
- `agents/skills/analyzePool-LPV3.ts` - LP V3 position modeling
- `agents/skills/analyzePool-Lending.ts` - Lending protocol analysis

---

### 3. **Position Analysis (Monte Carlo + Historical Data)**

```
Position Discovery
    ↓
DeFiLlama API
    ↓ Pool TVL, volume, fees
    ↓
CoinGecko API
    ↓ Historical prices (90 days)
    ↓
Calculate Distribution Parameters
    ↓ μ (drift), σ (volatility)
    ↓
Monte Carlo Simulation
    ↓ 1000 scenarios
    ↓
Risk Assessment
    ↓ Expected return
    ↓ Probability of loss
    ↓ VaR, Sharpe ratio
```

**Example Output:**
```
📊 WBNB-USDT LP Position Analysis

Historical Data (90 days):
  WBNB: $612.45 → $589.23 (-3.8%)
  USDT: $1.000 → $1.001 (+0.1%)
  
Distribution Parameters:
  μ (daily drift):      -0.042%
  σ (daily volatility):  2.87%
  Annualized vol:       54.86%

Monte Carlo Results (1000 simulations):
  Expected Value:       $10,456
  Expected Return:      +$456 (+4.56%)
  Risk (Std Dev):       $187
  Probability of Loss:  8.3%
  
  5th percentile:       $10,089
  Median:              $10,478
  95th percentile:      $10,712

Risk Assessment: ✅ LOW RISK
```

---

### 4. **Opportunity Discovery**

```
Agent Evaluates:
    ↓
Current Position APY: 12.5%
New Opportunity APY:  18.2%
    ↓
Improvement: +5.7% (> threshold)
    ↓
Risk Check:
  - Volatility acceptable?   ✅
  - Correlation too high?    ✅
  - Min holding period met?  ✅
    ↓
Decision: REBALANCE ✅
```

**Decision Matrix:**

| Risk Profile | Min APY Improvement | Min Holding Period | Max Position Correlation |
|--------------|--------------------|--------------------|------------------------|
| Low          | +2.0%              | 7 days             | 0.7                    |
| Medium       | +1.5%              | 3 days             | 0.8                    |
| High         | +1.0%              | 1 day              | 0.9                    |

---

### 5. **Autonomous Execution (Session Keys)**

```
Agent Decision
    ↓
Build Transaction
    ↓ Remove liquidity from old pool
    ↓ Swap tokens if needed
    ↓ Add liquidity to new pool
    ↓
Sign with Session Key
    ↓ ERC-7715 permissions
    ↓ Time-limited (24h)
    ↓ Specific contracts only
    ↓
Submit via Biconomy
    ↓ Gasless transaction
    ↓ User doesn't pay gas
    ↓
On-Chain Execution
```

**Session Key Permissions:**
```typescript
{
  target: "0x...",           // PancakeSwap Router
  valueLimit: "1000000000",  // Max $1000
  maxCalls: 10,              // Max 10 transactions
  validUntil: timestamp + 86400, // 24 hours
  validAfter: timestamp
}
```

**Security:**
- ✅ Time-limited (24h max)
- ✅ Amount-limited (user-defined max)
- ✅ Contract whitelist (only PancakeSwap)
- ✅ Revocable anytime via dashboard

---

### 6. **Real-Time Updates (Server-Sent Events)**

```
Agent Server (Port 3002)
    ↓ SSE Stream
    ↓
Dashboard (Browser)
    ↓ Receives events
    ↓
Update UI:
  - Transaction status
  - Portfolio value
  - APY changes
  - Risk metrics
```

**Event Types:**
```typescript
{
  type: "delegation.received",
  data: { delegationId, amount, risk }
}

{
  type: "position.analyzed", 
  data: { position, expectedReturn, risk }
}

{
  type: "opportunity.found",
  data: { currentAPY, newAPY, improvement }
}

{
  type: "transaction.submitted",
  data: { txHash, type, amount }
}

{
  type: "transaction.confirmed",
  data: { txHash, newPosition }
}
```

---

## 🏗️ Architecture

```
┌─────────────────┐
│  User Browser   │
│   (Dashboard)   │
└────────┬────────┘
         │ 1. Delegate
         ↓
┌─────────────────┐
│ FlowCap Server  │  ← Railway (monorepo-production-6073.up.railway.app)
│  (Receiver)     │
│  Port 3001      │
└────────┬────────┘
         │ 2. Save delegation
         ↓
┌─────────────────┐
│ ~/.openclaw/    │
│  delegations/   │  ← File system storage
└────────┬────────┘
         │ 3. Read & monitor
         ↓
┌─────────────────┐
│ OpenClaw Agent  │  ← AI agent with skills
│  (Local/Cloud)  │
└────────┬────────┘
         │ 4. Analyze & execute
         ↓
┌─────────────────┐
│ Agent Server    │  ← SSE event stream
│  (Port 3002)    │
└────────┬────────┘
         │ 5. Stream events
         ↓
┌─────────────────┐
│  Dashboard UI   │  ← Real-time updates
└─────────────────┘
```

---

## 📦 Installation

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Add: COINGECKO_API_KEY, BICONOMY_API_KEY, etc.

# Build TypeScript
npm run build
```

---

## 🚀 Running the System

### Option 1: Full Stack (Recommended)

```bash
# Terminal 1: Start FlowCap Server (receives delegations)
npm run server:start

# Terminal 2: Start Agent Server (SSE events)
npm run agent:serve

# Terminal 3: Start OpenClaw Agent (monitoring)
npm run agent:run

# Terminal 4: Start Dashboard
cd dashboard && npm run dev
```

### Option 2: Production (Railway + Vercel)

1. **Deploy Server to Railway:**
   ```bash
   # Set start command in Railway:
   cd server && npm start
   ```

2. **Deploy Dashboard to Vercel:**
   ```bash
   cd dashboard && vercel deploy
   ```

3. **Update Environment Variables:**
   ```
   NEXT_PUBLIC_AGENT_SERVER_URL=https://monorepo-production-6073.up.railway.app
   ```

---

## 📊 Available Scripts

### Portfolio Analysis

```bash
# Complete portfolio evaluation with correlation matrix
npm run portfolio:evaluate

# Analyze specific position type
npm run analyze:lpv2
npm run analyze:lpv3
npm run analyze:lending

# Monte Carlo risk simulation
npm run calc:montecarlo

# Historical price backtesting
npm run calc:historical
```

### Server Management

```bash
# Start delegation receiver
npm run server:start

# Start agent SSE server
npm run agent:serve

# Check server health
curl http://localhost:3001/health
curl http://localhost:3002/health
```

### Testing

```bash
# Run all tests
npm test

# Test specific components
npm run test:portfolio
npm run test:lpv2
npm run test:montecarlo
npm run test:pricehistory
```

---

## 🔧 Configuration

### Risk Profiles

Edit `agents/config.yaml`:

```yaml
risk_profiles:
  low:
    min_apy_improvement: 2.0
    min_holding_period_days: 7
    max_position_correlation: 0.7
    max_portfolio_volatility: 0.15
  
  medium:
    min_apy_improvement: 1.5
    min_holding_period_days: 3
    max_position_correlation: 0.8
    max_portfolio_volatility: 0.25
  
  high:
    min_apy_improvement: 1.0
    min_holding_period_days: 1
    max_position_correlation: 0.9
    max_portfolio_volatility: 0.40
```

### Monitoring Intervals

```typescript
// agents/skills/PortfolioEvaluation.ts
const MONITORING_CONFIG = {
  checkInterval: 300000,        // 5 minutes
  priceHistoryDays: 90,         // 90 days for correlation
  monteCarloSimulations: 1000,  // Number of scenarios
  confidenceLevel: 0.95,        // 95% confidence
};
```

---

## 📁 Project Structure

```
monorepo/
├── server/
│   ├── index.ts                    # Delegation receiver (PORT 3001)
│   └── package.json
│
├── agents/
│   ├── server.ts                   # SSE event server (PORT 3002)
│   ├── openclaw-runner.ts          # AI agent runner
│   ├── config.yaml                 # Agent configuration
│   └── skills/
│       ├── PortfolioEvaluation.ts  # 📊 Portfolio analysis
│       ├── analyzePool-LPV2.ts     # LP V2 modeling
│       ├── analyzePool-LPV3.ts     # LP V3 modeling
│       ├── analyzePool-Lending.ts  # Lending analysis
│       ├── getPriceHistory.ts      # Historical price data
│       ├── getPoolData.ts          # DeFiLlama integration
│       └── execSwap.ts             # Transaction execution
│
├── dashboard/
│   ├── app/
│   │   └── page.tsx                # Main dashboard
│   ├── components/
│   │   ├── WalletConnect.tsx       # Coinbase wallet
│   │   ├── RiskSelector.tsx        # Risk profile UI
│   │   ├── PositionsList.tsx       # Current positions
│   │   └── TransactionHistory.tsx  # Transaction log
│   └── hooks/
│       ├── useBiconomy.ts          # Account abstraction
│       ├── useSessionKey.ts        # Session key management
│       └── useAgentEvents.ts       # SSE event stream
│
├── contracts/
│   └── SessionValidator.sol        # ERC-7715 validator
│
└── docs/
    ├── MONTE_CARLO_GUIDE.md        # Risk simulation guide
    ├── HISTORICAL_PRICES_GUIDE.md  # Backtesting guide
    └── ARCHITECTURE.md             # System architecture
```

---

## 🔐 Security

### Session Keys (ERC-7715)

```solidity
struct Permission {
    address target;      // Only PancakeSwap Router
    uint256 valueLimit;  // Max transaction amount
    uint48 validUntil;   // 24 hours max
    uint48 validAfter;   // Cannot use before timestamp
}
```

**User Controls:**
- ✅ Revoke session anytime via dashboard
- ✅ Set maximum investment amount
- ✅ Choose risk profile (limits volatility)
- ✅ View all transactions in real-time
- ✅ 24-hour automatic expiration

---

## 📊 Mathematical Models

### Impermanent Loss

```
IL = (2√r) / (1+r) - 1

Where:
  r = P_final / P_initial
  P = price ratio of token0/token1
```

### Portfolio Volatility

```
σ_p = √(w^T · Σ · w)

Where:
  w = weight vector
  Σ = covariance matrix
  w^T = transpose of weights
```

### Value at Risk (VaR)

```
VaR_α = μ - z_α · σ

Where:
  μ = expected return
  σ = standard deviation
  z_α = z-score for confidence level α
```

### Sharpe Ratio

```
Sharpe = (R_p - R_f) / σ_p

Where:
  R_p = portfolio return
  R_f = risk-free rate (0% for crypto)
  σ_p = portfolio volatility
```

---

## 🌐 API Integrations

| Service | Purpose | Rate Limit |
|---------|---------|------------|
| **CoinGecko** | Historical prices | 10-12 req/min (free) |
| **DeFiLlama** | Pool TVL & volume | No limit |
| **DexScreener** | Real-time pool data | No limit |
| **Biconomy** | Account abstraction | 100 req/min |
| **Owlracle** | Gas price estimates | 100 req/day (free) |

---

## 🐛 Debugging

### Check Server Status

```bash
# FlowCap Server (delegation receiver)
curl http://localhost:3001/health

# Agent Server (SSE events)
curl http://localhost:3002/health

# Check active delegations
curl http://localhost:3001/api/flowcap/status
```

### Check Delegation Files

```bash
# List all delegations
ls ~/.openclaw/flowcap-delegations/

# View active delegations
cat ~/.openclaw/flowcap-delegations/active.json

# View specific delegation
cat ~/.openclaw/flowcap-delegations/{delegationId}.json
```

### Monitor Agent Logs

```bash
# Watch agent logs in real-time
npm run agent:run
# Look for: "📥 Received delegation", "🔍 Analyzing position", "✅ Transaction submitted"
```

### Test SSE Stream

```bash
# Connect to event stream
curl -N http://localhost:3002/api/agent/events?wallet=0x...
```

---

## 🎓 Learn More

- **[Portfolio Evaluation Deep Dive](docs/PORTFOLIO_EVALUATION.md)**
- **[Monte Carlo Simulation Guide](docs/MONTE_CARLO_GUIDE.md)**
- **[Session Keys Explained](docs/SESSION_KEYS.md)**
- **[Correlation Matrix Mathematics](docs/CORRELATION_ANALYSIS.md)**

---

## 📜 License

MIT

---

## 🙏 Credits

- **PancakeSwap** - DEX protocol
- **Biconomy** - Account abstraction
- **CoinGecko** - Price data
- **DeFiLlama** - TVL & volume data
- **OpenClaw** - AI agent framework
