/**
 * FlowCap Service Worker
 * Runs the agent in the background even when the tab is closed
 */

const CACHE_NAME = 'flowcap-v1';
const SCAN_INTERVAL = 5 * 60 * 1000; // 5 minutes

let agentSession = null;
let scanIntervalId = null;
let isRunning = false;

// Service Worker lifecycle
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activated');
  event.waitUntil(clients.claim());
});

// Listen for messages from the main thread
self.addEventListener('message', async (event) => {
  const { type, data } = event.data;

  switch (type) {
    case 'INIT_AGENT':
      await initializeAgent(data.session);
      event.ports[0].postMessage({ success: true });
      break;

    case 'START_AGENT':
      startAgent();
      event.ports[0].postMessage({ success: true });
      break;

    case 'PAUSE_AGENT':
      pauseAgent();
      event.ports[0].postMessage({ success: true });
      break;

    case 'STOP_AGENT':
      stopAgent();
      event.ports[0].postMessage({ success: true });
      break;

    case 'GET_STATUS':
      event.ports[0].postMessage({
        isRunning,
        session: agentSession ? {
          userAddress: agentSession.userAddress,
          smartAccountAddress: agentSession.smartAccountAddress,
          riskProfile: agentSession.riskProfile,
          validUntil: agentSession.validUntil,
        } : null,
      });
      break;

    default:
      console.warn('[ServiceWorker] Unknown message type:', type);
  }
});

/**
 * Initialize agent with session data
 */
async function initializeAgent(session) {
  agentSession = session;
  console.log('[ServiceWorker] Agent initialized:', {
    user: session.userAddress,
    smartAccount: session.smartAccountAddress,
    risk: session.riskProfile,
  });

  // Notify all clients
  broadcastToClients({
    type: 'notification',
    timestamp: Date.now(),
    data: { message: '🤖 Agent initialized in background!' },
  });
}

/**
 * Start the agent monitoring loop
 */
function startAgent() {
  if (isRunning) {
    console.log('[ServiceWorker] Agent already running');
    return;
  }

  if (!agentSession) {
    console.error('[ServiceWorker] Cannot start - agent not initialized');
    return;
  }

  isRunning = true;
  console.log('[ServiceWorker] Agent started - monitoring every 5 minutes');

  // Broadcast status
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

/**
 * Pause the agent
 */
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

/**
 * Stop the agent and clear session
 */
function stopAgent() {
  pauseAgent();
  agentSession = null;

  broadcastToClients({
    type: 'notification',
    timestamp: Date.now(),
    data: { message: '🛑 Agent stopped' },
  });
}

/**
 * Scan for yield opportunities
 */
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

      // Send push notification
      await sendNotification({
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

    // Fetch pool data from API (delegating to main thread for complex logic)
    // Service Workers can't easily import ES modules, so we'll message the client
    const pools = await fetchPoolData();

    if (!pools || pools.length === 0) {
      console.log('[ServiceWorker] No pools found');
      return;
    }

    // Analyze pools for opportunities
    const opportunities = await analyzeOpportunities(pools);

    if (opportunities.length > 0) {
      console.log('[ServiceWorker] ✅ Found opportunities:', opportunities.length);

      // Send push notification for high-value opportunities
      const bestOpp = opportunities[0];
      if (bestOpp.apyImprovement > 2) {
        await sendNotification({
          title: 'FlowCap Opportunity Found!',
          body: `${bestOpp.apyImprovement.toFixed(2)}% APY improvement available. Open dashboard to execute.`,
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

/**
 * Fetch pool data (simplified - delegates complex logic to main thread)
 */
async function fetchPoolData() {
  try {
    // In a real implementation, this would call the actual APIs
    // For now, we'll delegate to the main thread via message passing
    const clients = await self.clients.matchAll();
    if (clients.length === 0) {
      console.log('[ServiceWorker] No active clients - skipping fetch');
      return [];
    }

    // Request data from active client
    const response = await sendMessageToClient(clients[0], {
      type: 'FETCH_POOL_DATA',
    });

    return response.pools || [];
  } catch (error) {
    console.error('[ServiceWorker] Failed to fetch pool data:', error);
    return [];
  }
}

/**
 * Analyze pools for opportunities
 */
async function analyzeOpportunities(pools) {
  // Simplified analysis - in production, this would use actual pool analysis logic
  const opportunities = [];

  for (const pool of pools) {
    // Check if pool matches risk profile
    if (!matchesRiskProfile(pool, agentSession.riskProfile)) {
      continue;
    }

    // Example: Look for pools with >3% APY improvement
    if (pool.apy && pool.apy > 3) {
      opportunities.push({
        poolId: pool.poolId,
        protocol: pool.protocol,
        apy: pool.apy,
        apyImprovement: pool.apy - 2, // Simplified
      });
    }
  }

  return opportunities;
}

/**
 * Check if pool matches user's risk profile
 */
function matchesRiskProfile(pool, riskProfile) {
  if (riskProfile === 'low') {
    // Only stablecoins
    const stablecoins = ['USDT', 'USDC', 'BUSD'];
    return pool.assets?.every((asset) => stablecoins.includes(asset));
  }
  return true; // Medium/high allow all
}

/**
 * Send push notification
 */
async function sendNotification({ title, body, icon, tag }) {
  try {
    const registration = await self.registration;
    await registration.showNotification(title, {
      body,
      icon: icon || '/hashfoxblack.png',
      badge: '/hashfoxblack.png',
      tag: tag || 'flowcap-notification',
      requireInteraction: false,
      vibrate: [200, 100, 200],
    });
  } catch (error) {
    console.error('[ServiceWorker] Failed to send notification:', error);
  }
}

/**
 * Broadcast message to all connected clients
 */
async function broadcastToClients(message) {
  const clients = await self.clients.matchAll();
  clients.forEach((client) => {
    client.postMessage(message);
  });
}

/**
 * Send message to specific client and wait for response
 */
function sendMessageToClient(client, message) {
  return new Promise((resolve) => {
    const messageChannel = new MessageChannel();
    messageChannel.port1.onmessage = (event) => {
      resolve(event.data);
    };
    client.postMessage(message, [messageChannel.port2]);
  });
}

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.openWindow('/') // Open dashboard
  );
});
