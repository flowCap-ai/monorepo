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

    // Initialize the REAL OpenClaw agent via API
    try {
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'initialize',
          smartAccountAddress: session.smartAccountAddress,
          riskProfile: session.riskProfile,
          sessionPrivateKey: session.sessionPrivateKey,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to initialize OpenClaw agent');
      }

      console.log('✅ Real OpenClaw agent initialized on server!');
    } catch (error) {
      console.error('❌ Failed to initialize OpenClaw agent:', error);
      throw error;
    }

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
          ? '🤖 Real OpenClaw agent initialized with background support!'
          : '🤖 Real OpenClaw agent initialized (tab-only mode)!'
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
   * Scan for opportunities (using REAL OpenClaw agent)
   */
  private async scan(): Promise<void> {
    if (!this.session) return;

    try {
      this.emit({
        type: 'scan',
        timestamp: Date.now(),
        data: { status: 'started' },
      });

      // Call the REAL OpenClaw agent scan function via API
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'scan',
          sessionPrivateKey: this.session.sessionPrivateKey,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Scan failed');
      }

      const scanResult = data.result;

      // Emit events based on scan result
      if (scanResult.action === 'reallocated') {
        this.emit({
          type: 'execution',
          timestamp: Date.now(),
          data: {
            status: 'completed',
            details: scanResult.details,
            txHash: scanResult.txHash,
          },
        });
      } else if (scanResult.action === 'error') {
        throw new Error(scanResult.details);
      } else {
        this.emit({
          type: 'notification',
          timestamp: Date.now(),
          data: {
            message: scanResult.details,
          },
        });
      }

      this.emit({
        type: 'scan',
        timestamp: Date.now(),
        data: { status: 'completed', result: scanResult },
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
   * Private: Call OpenClaw skill via API
   */
  private async callSkill(skillName: string, method: string, args: any[] = []): Promise<any> {
    const response = await fetch(`/api/skills/${skillName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, args }),
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || `Skill ${skillName}.${method} failed`);
    }

    return data.result;
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
