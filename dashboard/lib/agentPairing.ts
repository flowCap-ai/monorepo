/**
 * Agent Pairing System
 * Connects the dashboard to user's local OpenClaw instance
 */

export interface PairingCode {
  code: string; // e.g., "VIBE-1234"
  timestamp: number;
  expiresAt: number;
  status: 'pending' | 'approved' | 'expired' | 'rejected';
}

export interface AgentConnection {
  isPaired: boolean;
  pairingCode: PairingCode | null;
  socket: WebSocket | null;
  agentInfo: {
    version?: string;
    smartAccountAddress?: string;
    riskProfile?: string;
  } | null;
}

/**
 * Generate a unique pairing code (format: WORD-XXXX)
 */
export function generatePairingCode(): string {
  const words = ['FLOW', 'VIBE', 'GLOW', 'BEAM', 'WAVE', 'STAR', 'MOON', 'NOVA'];
  const word = words[Math.floor(Math.random() * words.length)];
  const digits = Math.floor(1000 + Math.random() * 9000); // 1000-9999
  return `${word}-${digits}`;
}

/**
 * Create a pairing code with expiration
 */
export function createPairingCode(): PairingCode {
  const now = Date.now();
  return {
    code: generatePairingCode(),
    timestamp: now,
    expiresAt: now + 5 * 60 * 1000, // 5 minutes
    status: 'pending',
  };
}

/**
 * Check if pairing code is expired
 */
export function isPairingCodeExpired(pairingCode: PairingCode): boolean {
  return Date.now() > pairingCode.expiresAt;
}

/**
 * Agent Pairing Manager
 * Manages WebSocket connection to local OpenClaw instance
 */
export class AgentPairingManager {
  private connection: AgentConnection = {
    isPaired: false,
    pairingCode: null,
    socket: null,
    agentInfo: null,
  };

  private listeners: Map<string, Set<(data: any) => void>> = new Map();

  /**
   * Start pairing process - generates code and waits for local agent
   */
  async startPairing(): Promise<PairingCode> {
    const pairingCode = createPairingCode();
    this.connection.pairingCode = pairingCode;

    console.log('🔗 Pairing code generated:', pairingCode.code);
    console.log('⏰ Expires in 5 minutes');

    // Store in localStorage for recovery
    if (typeof window !== 'undefined') {
      localStorage.setItem('flowcap-pairing-code', JSON.stringify(pairingCode));
    }

    return pairingCode;
  }

  /**
   * Connect to local OpenClaw instance via WebSocket
   */
  async connectToLocalAgent(port: number = 3001): Promise<boolean> {
    if (!this.connection.pairingCode) {
      throw new Error('No pairing code generated. Call startPairing() first.');
    }

    return new Promise((resolve, reject) => {
      try {
        // Connect to local OpenClaw WebSocket server
        const ws = new WebSocket(`ws://localhost:${port}/pairing`);

        ws.onopen = () => {
          console.log('🔌 Connected to local OpenClaw instance');

          // Send pairing request
          ws.send(JSON.stringify({
            type: 'pairing_request',
            code: this.connection.pairingCode!.code,
          }));
        };

        ws.onmessage = (event) => {
          const message = JSON.parse(event.data);

          switch (message.type) {
            case 'pairing_approved':
              console.log('✅ Pairing approved by local OpenClaw!');
              this.connection.isPaired = true;
              this.connection.pairingCode!.status = 'approved';
              this.connection.agentInfo = message.agentInfo;

              // Store connection state
              if (typeof window !== 'undefined') {
                localStorage.setItem('flowcap-agent-paired', 'true');
                localStorage.setItem('flowcap-agent-info', JSON.stringify(message.agentInfo));
              }

              this.emit('paired', message.agentInfo);
              resolve(true);
              break;

            case 'pairing_rejected':
              console.log('❌ Pairing rejected by local OpenClaw');
              this.connection.pairingCode!.status = 'rejected';
              this.emit('rejected', message.reason);
              ws.close();
              resolve(false);
              break;

            case 'scan_result':
              this.emit('scan', message.data);
              break;

            case 'execution_result':
              this.emit('execution', message.data);
              break;

            case 'error':
              this.emit('error', message.error);
              break;

            default:
              console.warn('Unknown message type:', message.type);
          }
        };

        ws.onerror = (error) => {
          console.error('❌ WebSocket error:', error);
          this.emit('error', 'Failed to connect to local OpenClaw. Is it running?');
          reject(new Error('WebSocket connection failed'));
        };

        ws.onclose = () => {
          console.log('🔌 Disconnected from local OpenClaw');
          this.connection.isPaired = false;
          this.connection.socket = null;
          this.emit('disconnected', null);
        };

        this.connection.socket = ws;
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Send command to local OpenClaw agent
   */
  async sendCommand(command: string, data: any = {}): Promise<void> {
    if (!this.connection.socket || !this.connection.isPaired) {
      throw new Error('Not connected to local OpenClaw. Pair first.');
    }

    this.connection.socket.send(JSON.stringify({
      type: command,
      data,
    }));
  }

  /**
   * Start agent scan
   */
  async startScan(): Promise<void> {
    await this.sendCommand('start_scan');
  }

  /**
   * Stop agent
   */
  async stopAgent(): Promise<void> {
    await this.sendCommand('stop_agent');
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): AgentConnection {
    return this.connection;
  }

  /**
   * Check if currently paired
   */
  isPaired(): boolean {
    return this.connection.isPaired;
  }

  /**
   * Disconnect from agent
   */
  disconnect(): void {
    if (this.connection.socket) {
      this.connection.socket.close();
    }
    this.connection.isPaired = false;
    this.connection.socket = null;
    this.connection.pairingCode = null;

    if (typeof window !== 'undefined') {
      localStorage.removeItem('flowcap-agent-paired');
      localStorage.removeItem('flowcap-pairing-code');
    }
  }

  /**
   * Event listener system
   */
  on(event: string, callback: (data: any) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }

  private emit(event: string, data: any): void {
    this.listeners.get(event)?.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('Error in event listener:', error);
      }
    });
  }
}

// Global singleton
let globalPairingManager: AgentPairingManager | null = null;

export function getPairingManager(): AgentPairingManager {
  if (!globalPairingManager) {
    globalPairingManager = new AgentPairingManager();
  }
  return globalPairingManager;
}
