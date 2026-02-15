/**
 * Client-Side OpenClaw Agent Runner
 * Runs directly in the user's browser - no server needed!
 * Now supports Service Worker for background execution
 */

import type { Address, Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { getServiceWorkerManager } from './serviceWorkerManager';

export interface AgentSession {
  userAddress: Address;
  smartAccountAddress: Address;
  sessionPrivateKey: Hex;
  riskProfile: 'low' | 'medium' | 'high';
  validUntil: number;
  status: 'idle' | 'running' | 'paused' | 'stopped';
}

export interface AgentEvent {
  type: 'scan' | 'opportunity' | 'execution' | 'error' | 'notification';
  timestamp: number;
  data: any;
}

/**
 * Client-Side Agent Runner
 * Runs OpenClaw agent directly in the user's browser
 * Uses Service Worker for background execution
 */
export class ClientSideAgent {
  private session: AgentSession | null = null;
  private intervalId: NodeJS.Timeout | null = null;
  private eventListeners: ((event: AgentEvent) => void)[] = [];
  private useServiceWorker: boolean = false;
  private swManager = getServiceWorkerManager();

  /**
   * Initialize agent with session key (signed in browser)
   */
  async initialize(session: AgentSession, options?: { useServiceWorker?: boolean }): Promise<void> {
    this.session = session;
    this.useServiceWorker = options?.useServiceWorker ?? false;

    // Register service worker if enabled
    if (this.useServiceWorker && typeof window !== 'undefined') {
      const registered = await this.swManager.register();
      if (registered) {
        console.log('✅ Service Worker enabled - agent will run in background');

        // Request notification permission
        await this.swManager.requestNotificationPermission();

        // Initialize agent in service worker
        await this.swManager.initializeAgent(session);

        // Listen for messages from service worker
        this.swManager.on('notification', (event) => this.emit(event));
        this.swManager.on('scan', (event) => this.emit(event));
        this.swManager.on('opportunity', (event) => this.emit(event));
        this.swManager.on('error', (event) => this.emit(event));
        this.swManager.on('execution', (event) => this.emit(event));
      } else {
        console.warn('⚠️ Service Worker not available - falling back to tab-only mode');
        this.useServiceWorker = false;
      }
    }

    this.emit({
      type: 'notification',
      timestamp: Date.now(),
      data: {
        message: this.useServiceWorker
          ? '🤖 Agent initialized with background support!'
          : '🤖 Agent initialized (tab-only mode)!'
      },
    });
  }

  /**
   * Start the agent monitoring loop
   */
  async start(): Promise<void> {
    if (!this.session) {
      throw new Error('Agent not initialized. Call initialize() first.');
    }

    if (this.session.status === 'running') {
      throw new Error('Agent is already running');
    }

    this.session.status = 'running';

    // If using service worker, delegate to it
    if (this.useServiceWorker) {
      await this.swManager.startAgent();
      return;
    }

    // Otherwise, run in main thread
    this.emit({
      type: 'notification',
      timestamp: Date.now(),
      data: {
        message: `🚀 Agent started! Monitoring for ${this.session.riskProfile} risk opportunities...`,
      },
    });

    // Start monitoring loop (every 5 minutes)
    await this.scan(); // Run immediately
    this.intervalId = setInterval(() => this.scan(), 5 * 60 * 1000);
  }

  /**
   * Stop the agent
   */
  async stop(): Promise<void> {
    if (this.useServiceWorker) {
      await this.swManager.stopAgent();
      if (this.session) {
        this.session.status = 'stopped';
      }
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.session) {
      this.session.status = 'stopped';
    }

    this.emit({
      type: 'notification',
      timestamp: Date.now(),
      data: { message: '🛑 Agent stopped' },
    });
  }

  /**
   * Pause the agent (can be resumed)
   */
  async pause(): Promise<void> {
    if (this.useServiceWorker) {
      await this.swManager.pauseAgent();
      if (this.session) {
        this.session.status = 'paused';
      }
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.session) {
      this.session.status = 'paused';
    }

    this.emit({
      type: 'notification',
      timestamp: Date.now(),
      data: { message: '⏸️ Agent paused' },
    });
  }

  /**
   * Resume the agent
   */
  async resume(): Promise<void> {
    if (!this.session) {
      throw new Error('Agent not initialized');
    }

    this.session.status = 'running';

    this.emit({
      type: 'notification',
      timestamp: Date.now(),
      data: { message: '▶️ Agent resumed' },
    });

    await this.scan();
    this.intervalId = setInterval(() => this.scan(), 5 * 60 * 1000);
  }

  /**
   * Scan for opportunities (core agent logic)
   */
  private async scan(): Promise<void> {
    if (!this.session) return;

    try {
      this.emit({
        type: 'scan',
        timestamp: Date.now(),
        data: { status: 'started' },
      });

      // Import skills dynamically (browser-compatible)
      const getPools = await this.importSkill('getPools');
      const analyzePool = await this.importSkill('analyzePool');

      // 1. Get all pools for risk profile
      const allPools = await getPools.getAllPools();
      const filteredPools = getPools.filterPoolsByRisk(allPools, this.session.riskProfile);

      this.emit({
        type: 'scan',
        timestamp: Date.now(),
        data: {
          status: 'pools_found',
          total: allPools.length,
          filtered: filteredPools.length,
          riskProfile: this.session.riskProfile,
        },
      });

      // 2. Analyze top opportunities
      const opportunities = [];
      for (const pool of filteredPools.slice(0, 5)) {
        try {
          const analysis = await analyzePool.analyzePool(pool.poolId);
          opportunities.push({
            pool: pool.poolId,
            apy: analysis.apy,
            tvl: analysis.tvl,
            riskScore: analysis.riskScore,
          });
        } catch (error) {
          console.warn(`Failed to analyze ${pool.poolId}:`, error);
        }
      }

      if (opportunities.length > 0) {
        this.emit({
          type: 'opportunity',
          timestamp: Date.now(),
          data: {
            opportunities: opportunities.sort((a, b) => b.apy - a.apy),
            bestAPY: Math.max(...opportunities.map((o) => o.apy)),
          },
        });
      }

      this.emit({
        type: 'scan',
        timestamp: Date.now(),
        data: { status: 'completed', opportunities: opportunities.length },
      });
    } catch (error) {
      this.emit({
        type: 'error',
        timestamp: Date.now(),
        data: {
          message: error instanceof Error ? error.message : 'Unknown error during scan',
          error,
        },
      });
    }
  }

  /**
   * Execute reallocation (using session key)
   */
  async executeReallocation(fromPool: string, toPool: string, amount: string): Promise<void> {
    if (!this.session) {
      throw new Error('Agent not initialized');
    }

    try {
      this.emit({
        type: 'execution',
        timestamp: Date.now(),
        data: {
          status: 'started',
          fromPool,
          toPool,
          amount,
        },
      });

      // Import execution skill
      const execSwap = await this.importSkill('execSwap');

      // Create session account for signing
      const sessionAccount = privateKeyToAccount(this.session.sessionPrivateKey);

      // Execute the reallocation
      // (Implementation would call the actual execSwap functions)
      this.emit({
        type: 'notification',
        timestamp: Date.now(),
        data: {
          message: `🔄 Executing reallocation: ${fromPool} → ${toPool}`,
        },
      });

      // TODO: Implement actual execution
      // This would call execSwap.withdrawFromVenus, executeSwap, supplyToVenus

      this.emit({
        type: 'execution',
        timestamp: Date.now(),
        data: {
          status: 'completed',
          txHash: '0x...',
        },
      });
    } catch (error) {
      this.emit({
        type: 'error',
        timestamp: Date.now(),
        data: {
          message: `Failed to execute reallocation: ${error instanceof Error ? error.message : 'Unknown error'}`,
          error,
        },
      });
    }
  }

  /**
   * Subscribe to agent events
   */
  on(callback: (event: AgentEvent) => void): () => void {
    this.eventListeners.push(callback);

    // Return unsubscribe function
    return () => {
      const index = this.eventListeners.indexOf(callback);
      if (index > -1) {
        this.eventListeners.splice(index, 1);
      }
    };
  }

  /**
   * Get current session info
   */
  getSession(): AgentSession | null {
    return this.session;
  }

  /**
   * Check if session is still valid
   */
  isSessionValid(): boolean {
    if (!this.session) return false;
    return Date.now() < this.session.validUntil * 1000;
  }

  /**
   * Private: Emit event to all listeners
   */
  private emit(event: AgentEvent): void {
    this.eventListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in event listener:', error);
      }
    });
  }

  /**
   * Private: Import skill dynamically (browser-compatible)
   */
  private async importSkill(skillName: string): Promise<any> {
    // In browser, we need to fetch skills from API
    // For now, this is a placeholder
    const response = await fetch(`/api/skills/${skillName}`);
    if (!response.ok) {
      throw new Error(`Failed to load skill: ${skillName}`);
    }
    return response.json();
  }
}

/**
 * Global agent instance (singleton)
 */
let globalAgent: ClientSideAgent | null = null;

/**
 * Get or create global agent instance
 */
export function getAgent(): ClientSideAgent {
  if (!globalAgent) {
    globalAgent = new ClientSideAgent();
  }
  return globalAgent;
}

/**
 * Hook for React components
 */
export function useAgent() {
  const agent = getAgent();
  return {
    agent,
    initialize: (session: AgentSession) => agent.initialize(session),
    start: () => agent.start(),
    stop: () => agent.stop(),
    pause: () => agent.pause(),
    resume: () => agent.resume(),
    isRunning: () => agent.getSession()?.status === 'running',
    session: agent.getSession(),
  };
}
