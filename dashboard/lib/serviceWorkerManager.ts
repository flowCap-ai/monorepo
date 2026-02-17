/**
 * Service Worker Manager
 * Handles registration and communication with the background agent
 */

export class ServiceWorkerManager {
  private registration: ServiceWorkerRegistration | null = null;
  private messageHandlers: Map<string, (data: any) => void> = new Map();

  /**
   * Register the service worker
   */
  async register(): Promise<boolean> {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      console.warn('Service Workers not supported in this browser');
      return false;
    }

    try {
      this.registration = await navigator.serviceWorker.register('/service-worker.js', {
        scope: '/',
      });

      console.log('✅ Service Worker registered:', this.registration.scope);

      // Listen for messages from service worker
      navigator.serviceWorker.addEventListener('message', (event) => {
        this.handleMessage(event.data);
      });

      // Wait for service worker to be ready
      await navigator.serviceWorker.ready;

      return true;
    } catch (error) {
      console.error('❌ Service Worker registration failed:', error);
      return false;
    }
  }

  /**
   * Check if service worker is registered and active
   */
  isActive(): boolean {
    return this.registration != null && this.registration.active != null;
  }

  /**
   * Request notification permission
   */
  async requestNotificationPermission(): Promise<boolean> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      console.warn('Notifications not supported');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission === 'denied') {
      console.warn('Notification permission denied');
      return false;
    }

    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  /**
   * Send message to service worker
   */
  async sendMessage(type: string, data?: any): Promise<any> {
    if (!this.registration?.active) {
      throw new Error('Service Worker not active');
    }

    return new Promise((resolve, reject) => {
      const messageChannel = new MessageChannel();

      // Timeout after 30 seconds
      const timer = setTimeout(() => {
        messageChannel.port1.onmessage = null;
        reject(new Error('Service Worker message timeout'));
      }, 30000);

      messageChannel.port1.onmessage = (event) => {
        clearTimeout(timer);
        if (event.data.error) {
          reject(new Error(event.data.error));
        } else {
          resolve(event.data);
        }
      };

      this.registration!.active!.postMessage(
        { type, data },
        [messageChannel.port2]
      );
    });
  }

  /**
   * Register a message handler
   */
  on(type: string, handler: (data: any) => void): () => void {
    this.messageHandlers.set(type, handler);

    // Return unsubscribe function
    return () => {
      this.messageHandlers.delete(type);
    };
  }

  /**
   * Handle messages from service worker
   */
  private handleMessage(message: any) {
    const handler = this.messageHandlers.get(message.type);
    if (handler) {
      handler(message);
    }
  }

  /**
   * Initialize agent in service worker
   */
  async initializeAgent(session: any): Promise<void> {
    await this.sendMessage('INIT_AGENT', { session });
  }

  /**
   * Start agent in service worker
   */
  async startAgent(): Promise<void> {
    await this.sendMessage('START_AGENT');
  }

  /**
   * Pause agent in service worker
   */
  async pauseAgent(): Promise<void> {
    await this.sendMessage('PAUSE_AGENT');
  }

  /**
   * Stop agent in service worker
   */
  async stopAgent(): Promise<void> {
    await this.sendMessage('STOP_AGENT');
  }

  /**
   * Get agent status from service worker
   */
  async getStatus(): Promise<{ isRunning: boolean; session: any | null }> {
    return await this.sendMessage('GET_STATUS');
  }

  /**
   * Unregister service worker (cleanup)
   */
  async unregister(): Promise<void> {
    if (this.registration) {
      await this.registration.unregister();
      this.registration = null;
      console.log('Service Worker unregistered');
    }
  }
}

// Singleton instance
let swManager: ServiceWorkerManager | null = null;

export function getServiceWorkerManager(): ServiceWorkerManager {
  if (!swManager) {
    swManager = new ServiceWorkerManager();
  }
  return swManager;
}
