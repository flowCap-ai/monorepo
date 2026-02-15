'use client';

/**
 * Agent Pairing Button
 * Connects dashboard to user's local OpenClaw instance
 */

import { useState, useEffect } from 'react';
import { getPairingManager, type PairingCode } from '../lib/agentPairing';

export default function AgentPairingButton() {
  const [isPaired, setIsPaired] = useState(false);
  const [pairingCode, setPairingCode] = useState<PairingCode | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentInfo, setAgentInfo] = useState<any>(null);

  const pairingManager = getPairingManager();

  useEffect(() => {
    // Check if already paired from localStorage
    const paired = localStorage.getItem('flowcap-agent-paired');
    if (paired === 'true') {
      setIsPaired(true);
      const info = localStorage.getItem('flowcap-agent-info');
      if (info) {
        setAgentInfo(JSON.parse(info));
      }
    }

    // Subscribe to pairing events
    const unsubPaired = pairingManager.on('paired', (info) => {
      setIsPaired(true);
      setAgentInfo(info);
      setIsConnecting(false);
      setPairingCode(null);
    });

    const unsubRejected = pairingManager.on('rejected', (reason) => {
      setError(`Pairing rejected: ${reason}`);
      setIsConnecting(false);
      setPairingCode(null);
    });

    const unsubError = pairingManager.on('error', (err) => {
      setError(err);
      setIsConnecting(false);
    });

    const unsubDisconnected = pairingManager.on('disconnected', () => {
      setIsPaired(false);
      setAgentInfo(null);
    });

    return () => {
      unsubPaired();
      unsubRejected();
      unsubError();
      unsubDisconnected();
    };
  }, []);

  const handleStartPairing = async () => {
    try {
      setError(null);
      setIsConnecting(true);

      // Generate pairing code
      const code = await pairingManager.startPairing();
      setPairingCode(code);

      // Try to connect to local agent
      await pairingManager.connectToLocalAgent();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
      setIsConnecting(false);
    }
  };

  const handleDisconnect = () => {
    pairingManager.disconnect();
    setIsPaired(false);
    setAgentInfo(null);
    setPairingCode(null);
  };

  if (isPaired) {
    return (
      <div className="p-4 bg-green-500/10 border border-green-500/50 rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-semibold text-green-400 font-mono">✅ AGENT CONNECTED</h4>
            {agentInfo && (
              <p className="text-sm text-gray-400 font-mono mt-1">
                Smart Account: {agentInfo.smartAccountAddress?.slice(0, 10)}...
              </p>
            )}
          </div>
          <button
            onClick={handleDisconnect}
            className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/50 rounded hover:bg-red-500/30 font-mono text-sm"
          >
            DISCONNECT
          </button>
        </div>
      </div>
    );
  }

  if (pairingCode) {
    return (
      <div className="p-6 bg-orange-500/10 border-2 border-orange-500 rounded-lg">
        <h4 className="text-xl font-bold text-orange-400 font-mono mb-4">
          🔗 PAIRING CODE
        </h4>

        <div className="bg-black p-6 rounded-lg border-2 border-orange-500 mb-4">
          <p className="text-4xl font-bold text-center text-orange-400 font-mono tracking-wider">
            {pairingCode.code}
          </p>
        </div>

        <div className="bg-gray-900 p-4 rounded-lg border border-gray-700 mb-4">
          <p className="text-sm text-gray-300 font-mono mb-3">
            <strong className="text-orange-400">Send this code to your OpenClaw agent:</strong>
          </p>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-500 font-mono mb-1">Option 1: Via Terminal</p>
              <code className="block bg-black p-3 rounded border border-gray-700 text-green-400 font-mono text-sm">
                openclaw pair {pairingCode.code}
              </code>
            </div>
            <div>
              <p className="text-xs text-gray-500 font-mono mb-1">Option 2: Via Chat/CLI</p>
              <code className="block bg-black p-3 rounded border border-gray-700 text-green-400 font-mono text-sm">
                pair {pairingCode.code}
              </code>
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-500 text-center font-mono">
          ⏰ Code expires in 5 minutes
        </p>

        {isConnecting && (
          <p className="text-sm text-orange-400 text-center mt-4 font-mono animate-pulse">
            Waiting for approval...
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-900 border border-gray-800 rounded-lg">
      <h4 className="text-lg font-semibold mb-3 text-orange-400 font-mono">
        🤖 CONNECT YOUR OPENCLAW AGENT
      </h4>

      <p className="text-sm text-gray-400 mb-4 font-mono">
        Connect your OpenClaw agent (already installed on your computer) to this dashboard.
      </p>

      <div className="bg-black p-4 rounded-lg border border-gray-700 mb-4">
        <p className="text-xs text-orange-400 font-mono mb-2">
          ℹ️ OpenClaw must be running on your computer
        </p>
        <p className="text-xs text-gray-500 font-mono">
          If you haven't installed OpenClaw yet, download it from{' '}
          <a href="https://flowcap.ai/openclaw" className="text-blue-400 underline">
            flowcap.ai/openclaw
          </a>
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/50 rounded mb-4">
          <p className="text-sm text-red-400 font-mono">{error}</p>
        </div>
      )}

      <button
        onClick={handleStartPairing}
        disabled={isConnecting}
        className="w-full bg-gradient-to-r from-orange-600 to-red-600 text-white px-6 py-3 rounded-lg font-bold hover:from-orange-500 hover:to-red-500 transition disabled:opacity-50 disabled:cursor-not-allowed font-mono"
      >
        {isConnecting ? '⏳ CONNECTING...' : '🔗 CONNECT TO LOCAL AGENT'}
      </button>

      <p className="text-xs text-gray-500 text-center mt-3 font-mono">
        OpenClaw runs on YOUR computer. Dashboard just connects to it.
      </p>
    </div>
  );
}
