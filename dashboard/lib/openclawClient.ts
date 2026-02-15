/**
 * OpenClaw Gateway Client
 * Connects the FlowCap dashboard to the user's local OpenClaw instance
 */

export interface OpenClawMessage {
  type: 'req' | 'res' | 'event';
  id?: string;
  method?: string;
  params?: any;
  ok?: boolean;
  payload?: any;
  error?: string;
  event?: string;
}

export interface OpenClawConnectParams {
  protocol: {
    min: number;
    max: number;
  };
  client: {
    name: string;
    version: string;
    platform: string;
  };
  role: 'operator';
  scopes: string[];
  device?: {
    id?: string;
    name?: string;
  };
  auth?: {
    token?: string;
    deviceToken?: string;
  };
}

export class OpenClawClient {
  private ws: WebSocket | null = null;
  private messageId = 0;
  private pendingRequests = new Map<string, { resolve: (value: any) => void; reject: (error: any) => void }>();
  private eventHandlers = new Map<string, Set<(payload: any) => void>>();
  private deviceToken: string | null = null;

  constructor(private gatewayUrl: string = 'ws://127.0.0.1:18789') {}

  /**
   * Connect to OpenClaw Gateway
   */
  async connect(authToken?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.gatewayUrl);

      this.ws.onopen = () => {
        console.log('🦞 Connected to OpenClaw Gateway');
      };

      this.ws.onmessage = async (event) => {
        const message: OpenClawMessage = JSON.parse(event.data);

        // Handle connect challenge
        if (message.type === 'event' && message.event === 'connect.challenge') {
          const { nonce } = message.payload;

          // Send connect request
          const connectParams: OpenClawConnectParams = {
            protocol: {
              min: 1,
              max: 1,
            },
            client: {
              name: 'FlowCap Dashboard',
              version: '1.0.0',
              platform: 'web',
            },
            role: 'operator',
            scopes: ['operator.read', 'operator.write'],
            device: {
              name: 'FlowCap Dashboard',
            },
            auth: {
              token: authToken,
              deviceToken: this.deviceToken || undefined,
            },
          };

          this.ws?.send(JSON.stringify({
            type: 'req',
            id: 'connect-1',
            method: 'connect',
            params: connectParams,
          }));
        }

        // Handle connect response
        if (message.type === 'res' && message.id === 'connect-1') {
          if (message.ok) {
            console.log('✅ Connected to OpenClaw');
            this.deviceToken = message.payload?.auth?.deviceToken || null;

            // Store device token for future connections
            if (this.deviceToken) {
              localStorage.setItem('openclaw-device-token', this.deviceToken);
            }

            resolve();
          } else {
            reject(new Error(message.error || 'Failed to connect'));
          }
        }

        // Handle responses
        if (message.type === 'res' && message.id) {
          const pending = this.pendingRequests.get(message.id);
          if (pending) {
            if (message.ok) {
              pending.resolve(message.payload);
            } else {
              pending.reject(new Error(message.error || 'Request failed'));
            }
            this.pendingRequests.delete(message.id);
          }
        }

        // Handle events
        if (message.type === 'event' && message.event) {
          const handlers = this.eventHandlers.get(message.event);
          if (handlers) {
            handlers.forEach(handler => handler(message.payload));
          }
        }
      };

      this.ws.onerror = (error) => {
        console.error('OpenClaw connection error:', error);
        reject(error);
      };

      this.ws.onclose = () => {
        console.log('OpenClaw connection closed');
        this.pendingRequests.forEach(({ reject }) => reject(new Error('Connection closed')));
        this.pendingRequests.clear();
      };
    });
  }

  /**
   * Send a request to OpenClaw and wait for response
   */
  async request(method: string, params?: any): Promise<any> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to OpenClaw');
    }

    const id = `req-${++this.messageId}`;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      this.ws!.send(JSON.stringify({
        type: 'req',
        id,
        method,
        params,
      }));

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  /**
   * Subscribe to OpenClaw events
   */
  on(event: string, handler: (payload: any) => void): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.eventHandlers.get(event)?.delete(handler);
    };
  }

  /**
   * Send a message to the agent
   */
  async sendAgentMessage(message: string, options?: {
    agent?: string;
    sessionId?: string;
    thinking?: 'off' | 'minimal' | 'low' | 'medium' | 'high';
  }): Promise<any> {
    return this.request('agent.message', {
      message,
      agent: options?.agent,
      sessionId: options?.sessionId,
      thinking: options?.thinking,
    });
  }

  /**
   * Get agent status
   */
  async getAgentStatus(): Promise<any> {
    return this.request('agent.status', {});
  }

  /**
   * List available skills
   */
  async listSkills(): Promise<any> {
    return this.request('skills.list', {});
  }

  /**
   * Install a skill
   */
  async installSkill(skillName: string): Promise<any> {
    return this.request('skills.install', { skill: skillName });
  }

  /**
   * Disconnect from OpenClaw
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
let openclawClient: OpenClawClient | null = null;

export function getOpenClawClient(): OpenClawClient {
  if (!openclawClient) {
    openclawClient = new OpenClawClient();
  }
  return openclawClient;
}
