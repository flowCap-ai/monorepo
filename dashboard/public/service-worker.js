/**
 * FlowCap Service Worker
 * Runs the agent in the background even when the tab is closed.
 *
 * F6: Autonomous — fetches pool data directly via REST APIs (no main-thread delegation).
 */

const CACHE_NAME = 'flowcap-v1';
const SCAN_INTERVAL = 5 * 60 * 1000; // 5 minutes
const API_BASE = self.location.origin; // e.g. http://localhost:3000

let agentSession = null;
let scanIntervalId = null;
let isRunning = false;

// ─── Service Worker lifecycle ────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activated');
  event.waitUntil(self.clients.claim());
});

// ─── Message handler ─────────────────────────────────────────
self.addEventListener('message', async (event) => {
  const { type, data } = event.data;

  switch (type) {
    case 'INIT_AGENT':
      await initializeAgent(data.session);
      if (event.ports[0]) event.ports[0].postMessage({ success: true });
      break;

    case 'START_AGENT':
      startAgent();
      if (event.ports[0]) event.ports[0].postMessage({ success: true });
      break;

    case 'PAUSE_AGENT':
      pauseAgent();
      if (event.ports[0]) event.ports[0].postMessage({ success: true });
      break;

    case 'STOP_AGENT':
      stopAgent();
      if (event.ports[0]) event.ports[0].postMessage({ success: true });
      break;

    case 'GET_STATUS':
      if (event.ports[0]) {
        event.ports[0].postMessage({
          isRunning,
          session: agentSession ? {
            userAddress: agentSession.userAddress,
            smartAccountAddress: agentSession.smartAccountAddress,
            riskProfile: agentSession.riskProfile,
            validUntil: agentSession.validUntil,
          } : null,
        });
      }
      break;

    default:
      console.warn('[ServiceWorker] Unknown message type:', type);
  }
});

// ─── Agent lifecycle ─────────────────────────────────────────

async function initializeAgent(session) {
  agentSession = session;
  console.log('[ServiceWorker] Agent initialized:', {
    user: session.userAddress,
    smartAccount: session.smartAccountAddress,
    risk: session.riskProfile,
  });

  broadcastToClients({
    type: 'notification',
    timestamp: Date.now(),
    data: { message: '🤖 Agent initialized in background!' },
  });
}

function startAgent() {
  if (isRunning) return;
  if (!agentSession) {
    console.error('[ServiceWorker] Cannot start - agent not initialized');
    return;
  }

  isRunning = true;
  console.log('[ServiceWorker] Agent started - monitoring every 5 minutes');

  broadcastToClients({
    type: 'notification',
    timestamp: Date.now(),
    data: {
      message: `🚀 Agent started! Monitoring for ${agentSession.riskProfile} risk opportunities...`,
    },
  });

  // Run first scan immediately
  scanYieldOpportunities();

  // Start interval
  scanIntervalId = setInterval(() => {
    scanYieldOpportunities();
  }, SCAN_INTERVAL);
}

function pauseAgent() {
  if (scanIntervalId) {
    clearInterval(scanIntervalId);
    scanIntervalId = null;
  }
  isRunning = false;

  broadcastToClients({
    type: 'notification',
    timestamp: Date.now(),
    data: { message: '⏸️ Agent paused' },
  });
}

function stopAgent() {
  pauseAgent();
  agentSession = null;

  broadcastToClients({
    type: 'notification',
    timestamp: Date.now(),
    data: { message: '🛑 Agent stopped' },
  });
}

// ─── Core scan (AUTONOMOUS) ─────────────────────────────────

async function scanYieldOpportunities() {
  if (!agentSession || !isRunning) return;

  try {
    console.log('[ServiceWorker] 🔍 Scanning yields...');

    broadcastToClients({
      type: 'scan',
      timestamp: Date.now(),
      data: { status: 'scanning' },
    });

    // Check session expiry
    const now = Math.floor(Date.now() / 1000);
    if (now > agentSession.validUntil) {
      console.warn('[ServiceWorker] Session expired!');
      stopAgent();

      await showPushNotification({
        title: 'FlowCap Session Expired',
        body: 'Your session key has expired. Please re-delegate to continue.',
        icon: '/hashfoxblack.png',
      });

      broadcastToClients({
        type: 'error',
        timestamp: Date.now(),
        data: { message: '⏰ Session expired - please re-delegate' },
      });
      return;
    }

    // Warn when session key is close to expiring (< 24h)
    const remainingSeconds = agentSession.validUntil - now;
    if (remainingSeconds < 86400 && remainingSeconds > 85800) {
      // Only warn once (when crossing the 24h boundary)
      await showPushNotification({
        title: 'Session Key Expiring Soon',
        body: `Your session key expires in ${Math.floor(remainingSeconds / 3600)} hours. Please renew.`,
        icon: '/hashfoxblack.png',
        tag: 'session-expiry',
      });
    }

    // F6: Fetch pool data DIRECTLY via REST API (no main-thread delegation)
    const pools = await fetchPoolDataAutonomously();

    if (!pools || pools.length === 0) {
      console.log('[ServiceWorker] No pools found');
      broadcastToClients({
        type: 'scan',
        timestamp: Date.now(),
        data: { status: 'complete', opportunities: 0 },
      });
      return;
    }

    // Analyze pools for opportunities
    const opportunities = analyzeOpportunities(pools);

    if (opportunities.length > 0) {
      console.log('[ServiceWorker] ✅ Found opportunities:', opportunities.length);

      const bestOpp = opportunities[0];
      if (bestOpp.apyImprovement > 2) {
        await showPushNotification({
          title: 'FlowCap Opportunity Found!',
          body: `${bestOpp.apyImprovement.toFixed(2)}% APY improvement available on ${bestOpp.protocol}.`,
          icon: '/hashfoxblack.png',
          tag: 'opportunity',
        });
      }

      broadcastToClients({
        type: 'opportunity',
        timestamp: Date.now(),
        data: { opportunities },
      });
    } else {
      console.log('[ServiceWorker] No profitable opportunities found');
      broadcastToClients({
        type: 'scan',
        timestamp: Date.now(),
        data: { status: 'complete', opportunities: 0 },
      });
    }
  } catch (error) {
    console.error('[ServiceWorker] Scan error:', error);
    broadcastToClients({
      type: 'error',
      timestamp: Date.now(),
      data: { message: `Scan failed: ${error.message}` },
    });
  }
}

// ─── F6: Autonomous data fetching ───────────────────────────

/**
 * Fetch pool data DIRECTLY via the skills REST API.
 * No main-thread delegation — works even when all tabs are closed.
 */
async function fetchPoolDataAutonomously() {
  try {
    // Call getPoolData skill via the Next.js API route
    const res = await fetch(`${API_BASE}/api/skills/getPoolData`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: 'getMultiplePoolData',
        args: [],
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.warn(`[ServiceWorker] Pool data API returned ${res.status}`);
      return [];
    }

    const data = await res.json();
    return data.success ? (data.result || []) : [];
  } catch (error) {
    console.error('[ServiceWorker] Failed to fetch pool data:', error);
    return [];
  }
}

// ─── Analysis ───────────────────────────────────────────────

/**
 * Analyze pools for yield opportunities.
 * Filters by risk profile and compares against a baseline APY.
 */
function analyzeOpportunities(pools) {
  const opportunities = [];
  const baselineAPY = 2; // Assume current position earning ~2% (or use stored position data)

  for (const pool of pools) {
    if (!matchesRiskProfile(pool, agentSession.riskProfile)) continue;

    const apy = pool.apy || pool.supplyApy || 0;
    if (apy <= baselineAPY) continue;

    opportunities.push({
      poolId: pool.poolId || pool.id,
      protocol: pool.protocol || 'Unknown',
      apy,
      apyImprovement: apy - baselineAPY,
    });
  }

  // Sort by APY improvement (best first)
  opportunities.sort((a, b) => b.apyImprovement - a.apyImprovement);

  return opportunities;
}

/**
 * Check if pool matches user's risk profile
 */
function matchesRiskProfile(pool, riskProfile) {
  const stablecoins = ['USDT', 'USDC', 'BUSD', 'DAI', 'FDUSD'];
  const mediumTokens = [...stablecoins, 'BNB', 'WBNB'];

  const assets = pool.assets || [];

  switch (riskProfile) {
    case 'low':
      return assets.every((asset) => stablecoins.includes(asset.toUpperCase()));
    case 'medium':
      return assets.every((asset) => mediumTokens.includes(asset.toUpperCase()));
    case 'high':
      return true; // High risk allows all tokens
    default:
      return false;
  }
}

// ─── Utilities ──────────────────────────────────────────────

async function showPushNotification({ title, body, icon, tag }) {
  try {
    await self.registration.showNotification(title, {
      body,
      icon: icon || '/hashfoxblack.png',
      badge: '/hashfoxblack.png',
      tag: tag || 'flowcap-notification',
      requireInteraction: false,
      vibrate: [200, 100, 200],
    });
  } catch (error) {
    console.error('[ServiceWorker] Failed to show notification:', error);
  }
}

async function broadcastToClients(message) {
  const allClients = await self.clients.matchAll();
  allClients.forEach((client) => client.postMessage(message));
}

// ─── Notification click handler ─────────────────────────────

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow('/'));
});
