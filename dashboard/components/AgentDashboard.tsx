'use client';

/**
 * Agent Dashboard - Run OpenClaw directly from browser
 * No .env configuration needed!
 */

import { useState, useEffect } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { createSmartAccount, generateSessionKey, delegateSessionKey } from '../lib/biconomyClient';
import { getAgent, type AgentEvent, type AgentSession } from '../lib/clientSideAgent';

type RiskProfile = 'low' | 'medium' | 'high';

export default function AgentDashboard() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [riskProfile, setRiskProfile] = useState<RiskProfile>('low');
  const [maxInvestment, setMaxInvestment] = useState<string>('1000'); // USD amount
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Agent state
  const [agentSession, setAgentSession] = useState<AgentSession | null>(null);
  const [agentStatus, setAgentStatus] = useState<'idle' | 'running' | 'paused' | 'stopped'>('idle');
  const [events, setEvents] = useState<AgentEvent[]>([]);

  const agent = getAgent();

  // Subscribe to agent events
  useEffect(() => {
    const unsubscribe = agent.on((event) => {
      setEvents((prev) => [...prev.slice(-50), event]); // Keep last 50 events

      // Update status from session
      const session = agent.getSession();
      if (session) {
        setAgentStatus(session.status);
      }
    });

    return unsubscribe;
  }, []);

  /**
   * Start Agent - All in one flow!
   */
  const handleStartAgent = async () => {
    if (!address || !isConnected) {
      setError('Please connect your wallet first');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('🚀 Starting FlowCap Agent...');

      // Step 1: Validate investment amount
      const maxInvestmentUSD = parseFloat(maxInvestment);
      if (isNaN(maxInvestmentUSD) || maxInvestmentUSD < 10) {
        throw new Error('Minimum investment is $10');
      }

      // Validate against risk profile limits
      const riskLimits = { low: 5000, medium: 10000, high: 50000 };
      if (maxInvestmentUSD > riskLimits[riskProfile]) {
        throw new Error(`${riskProfile.toUpperCase()} risk profile maximum is $${riskLimits[riskProfile].toLocaleString()}`);
      }

      // Step 2: Create/get smart account
      const smartAccount = await createSmartAccount(address);
      console.log('✅ Smart account:', smartAccount.address);

      // Convert USD to Wei (assuming 1:1 for stablecoins, adjust for other tokens)
      const maxValueWei = BigInt(Math.floor(maxInvestmentUSD * 1e18));

      // Step 3: Generate session key with risk-based permissions AND custom value limit
      const sessionKeyData = generateSessionKey(smartAccount.address, riskProfile, maxValueWei);
      console.log('✅ Session key generated with', riskProfile, 'risk permissions');
      console.log('Max investment per transaction:', maxInvestmentUSD, 'USD');

      // Step 4: User signs delegation message
      const message = `FlowCap Agent Delegation

I authorize the FlowCap agent to manage my yield positions with these restrictions:

Smart Account: ${smartAccount.address}
Session Key: ${sessionKeyData.sessionAddress}
Risk Profile: ${riskProfile.toUpperCase()}
Max Per Transaction: $${maxInvestmentUSD.toLocaleString()} USD
Valid Until: ${new Date(sessionKeyData.validUntil * 1000).toLocaleString()}

SECURITY GUARANTEES:
✓ Agent can use up to $${maxInvestmentUSD.toLocaleString()} per transaction
✓ Agent can ONLY swap and supply/withdraw on allowed protocols
✓ Agent CANNOT transfer funds to external addresses
✓ Session expires in 7 days

By signing, I start my personal AI agent.`;

      await signMessageAsync({ message });
      console.log('✅ Delegation signed');

      // Step 4: Delegate session key on-chain
      const delegationResult = await delegateSessionKey(
        address,
        smartAccount.address,
        sessionKeyData
      );

      if (!delegationResult.success) {
        throw new Error(`Session key delegation failed: ${delegationResult.error}`);
      }

      if (delegationResult.txHash) {
        console.log('✅ Session key delegated on-chain:', delegationResult.txHash);
      } else {
        console.log('⚠️ Session key registered (optimistic mode - no on-chain tx yet)');
      }

      // Step 5: Initialize agent with session
      const session: AgentSession = {
        userAddress: address,
        smartAccountAddress: smartAccount.address,
        sessionPrivateKey: sessionKeyData.sessionPrivateKey,
        riskProfile,
        validUntil: sessionKeyData.validUntil,
        status: 'idle',
      };

      // Enable Service Worker for background execution
      await agent.initialize(session, { useServiceWorker: true });
      setAgentSession(session);
      console.log('✅ Agent initialized');

      // Step 6: Start the agent!
      await agent.start();
      console.log('✅ Agent started!');

      setAgentStatus('running');
    } catch (err) {
      console.error('❌ Error starting agent:', err);
      setError(err instanceof Error ? err.message : 'Failed to start agent');
    } finally {
      setLoading(false);
    }
  };

  const handleStopAgent = () => {
    agent.stop();
    setAgentStatus('stopped');
  };

  const handlePauseAgent = () => {
    agent.pause();
    setAgentStatus('paused');
  };

  const handleResumeAgent = async () => {
    await agent.resume();
    setAgentStatus('running');
  };

  if (!isConnected) {
    return (
      <div className="p-6 bg-gray-900 border border-yellow-500/50 rounded-lg">
        <h3 className="text-lg font-semibold mb-2 text-yellow-400 font-mono">⚠️ CONNECT WALLET TO START AGENT</h3>
        <p className="text-gray-400 font-mono text-sm">
          Connect your wallet to start your personal AI agent. No configuration files needed!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Agent Not Started */}
      {!agentSession && (
        <div className="p-6 bg-gray-900 border border-gray-800 rounded-lg">
          <h3 className="text-xl font-bold mb-4 text-orange-400 font-mono">🤖 START YOUR AI AGENT</h3>

          <p className="text-gray-400 mb-6 font-mono text-sm">
            Start your personal FlowCap agent with one click. It runs directly in your browser - no
            servers or configuration needed!
          </p>

          {/* Investment Amount */}
          <div className="mb-6">
            <label className="block text-sm font-semibold mb-2 text-gray-300 font-mono">MAX INVESTMENT PER TRANSACTION:</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-mono text-lg">$</span>
              <input
                type="number"
                value={maxInvestment}
                onChange={(e) => setMaxInvestment(e.target.value)}
                min="10"
                max="50000"
                step="10"
                className="w-full pl-10 pr-4 py-3 bg-black border-2 border-gray-700 rounded-lg text-white font-mono text-lg focus:border-orange-500 focus:outline-none"
                placeholder="1000"
              />
            </div>
            <p className="text-xs text-gray-500 mt-2 font-mono">
              💡 Agent can use up to this amount per transaction. Minimum: $10
            </p>
          </div>

          {/* Risk Profile Selection */}
          <div className="mb-6">
            <label className="block text-sm font-semibold mb-2 text-gray-300 font-mono">SELECT RISK PROFILE:</label>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setRiskProfile('low')}
                className={`p-4 border-2 rounded-lg transition ${
                  riskProfile === 'low'
                    ? 'border-green-500 bg-green-500/10'
                    : 'border-gray-700 hover:border-green-500/50 bg-black'
                }`}
              >
                <div className="font-semibold text-green-400 font-mono">🛡️ LOW</div>
                <div className="text-xs text-gray-500 mt-1 font-mono">Stablecoins only</div>
                <div className="text-xs text-gray-600 mt-1 font-mono">Max: $5,000</div>
              </button>

              <button
                onClick={() => setRiskProfile('medium')}
                className={`p-4 border-2 rounded-lg transition ${
                  riskProfile === 'medium'
                    ? 'border-orange-500 bg-orange-500/10'
                    : 'border-gray-700 hover:border-orange-500/50 bg-black'
                }`}
              >
                <div className="font-semibold text-orange-400 font-mono">⚖️ MEDIUM</div>
                <div className="text-xs text-gray-500 mt-1 font-mono">+ Liquid staking</div>
                <div className="text-xs text-gray-600 mt-1 font-mono">Max: $10,000</div>
              </button>

              <button
                onClick={() => setRiskProfile('high')}
                className={`p-4 border-2 rounded-lg transition ${
                  riskProfile === 'high'
                    ? 'border-red-500 bg-red-500/10'
                    : 'border-gray-700 hover:border-red-500/50 bg-black'
                }`}
              >
                <div className="font-semibold text-red-400 font-mono">🚀 HIGH</div>
                <div className="text-xs text-gray-500 mt-1 font-mono">+ Volatile assets</div>
                <div className="text-xs text-gray-600 mt-1 font-mono">Max: $50,000</div>
              </button>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-lg mb-4">
              <p className="text-sm text-red-400 font-mono">{error}</p>
            </div>
          )}

          {/* Start Button */}
          <button
            onClick={handleStartAgent}
            disabled={loading}
            className="w-full bg-gradient-to-r from-orange-600 to-red-600 text-white px-6 py-4 rounded-lg font-bold hover:from-orange-500 hover:to-red-500 transition disabled:opacity-50 disabled:cursor-not-allowed font-mono text-sm"
          >
            {loading ? '⏳ STARTING AGENT...' : '🚀 START AGENT (SIGN & GO!)'}
          </button>

          <p className="text-xs text-gray-500 text-center mt-3 font-mono">
            You'll sign one message to delegate permissions. Agent starts immediately!
          </p>
        </div>
      )}

      {/* Agent Running */}
      {agentSession && (
        <div className="space-y-4">
          {/* Status Card */}
          <div className="p-6 bg-gray-900 border border-gray-800 rounded-lg">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xl font-bold font-mono">
                  {agentStatus === 'running' ? '🟢 AGENT RUNNING' : ''}
                  {agentStatus === 'paused' ? '🟡 AGENT PAUSED' : ''}
                  {agentStatus === 'stopped' ? '🔴 AGENT STOPPED' : ''}
                </h3>
                <p className="text-sm text-gray-500 font-mono">
                  RISK: <span className="text-orange-400">{agentSession.riskProfile.toUpperCase()}</span>
                </p>
              </div>

              {/* Controls */}
              <div className="flex gap-2">
                {agentStatus === 'running' && (
                  <>
                    <button
                      onClick={handlePauseAgent}
                      className="px-4 py-2 bg-yellow-500/20 text-yellow-400 border border-yellow-500/50 rounded hover:bg-yellow-500/30 font-mono text-sm"
                    >
                      ⏸️ PAUSE
                    </button>
                    <button
                      onClick={handleStopAgent}
                      className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/50 rounded hover:bg-red-500/30 font-mono text-sm"
                    >
                      🛑 STOP
                    </button>
                  </>
                )}
                {agentStatus === 'paused' && (
                  <>
                    <button
                      onClick={handleResumeAgent}
                      className="px-4 py-2 bg-green-500/20 text-green-400 border border-green-500/50 rounded hover:bg-green-500/30 font-mono text-sm"
                    >
                      ▶️ RESUME
                    </button>
                    <button
                      onClick={handleStopAgent}
                      className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/50 rounded hover:bg-red-500/30 font-mono text-sm"
                    >
                      🛑 STOP
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Session Info */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500 font-mono text-xs">SMART ACCOUNT:</p>
                <p className="font-mono text-xs text-orange-400">{agentSession.smartAccountAddress.slice(0, 10)}...</p>
              </div>
              <div>
                <p className="text-gray-500 font-mono text-xs">VALID UNTIL:</p>
                <p className="text-xs text-orange-400 font-mono">{new Date(agentSession.validUntil * 1000).toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Activity Feed */}
          <div className="p-6 bg-gray-900 border border-gray-800 rounded-lg">
            <h4 className="text-lg font-semibold mb-4 text-orange-400 font-mono">📊 AGENT ACTIVITY FEED</h4>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {events.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4 font-mono">
                  Waiting for agent activity...
                </p>
              )}

              {events
                .slice()
                .reverse()
                .map((event, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded border-l-4 bg-black ${
                      event.type === 'error'
                        ? 'border-red-500'
                        : event.type === 'execution'
                        ? 'border-green-500'
                        : event.type === 'opportunity'
                        ? 'border-orange-500'
                        : 'border-gray-700'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="text-xs text-gray-500 font-mono">
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </div>
                        <div className={`text-sm mt-1 font-mono ${
                          event.type === 'error' ? 'text-red-400' :
                          event.type === 'execution' ? 'text-green-400' :
                          event.type === 'opportunity' ? 'text-orange-400' :
                          'text-gray-300'
                        }`}>
                          {event.type === 'notification' && event.data.message}
                          {event.type === 'scan' && (
                            <>
                              {event.data.status === 'started' && '🔍 SCANNING FOR OPPORTUNITIES...'}
                              {event.data.status === 'pools_found' && (
                                <>
                                  FOUND {event.data.filtered} POOLS (RISK: {event.data.riskProfile.toUpperCase()})
                                </>
                              )}
                              {event.data.status === 'completed' && (
                                <>✅ SCAN COMPLETE ({event.data.opportunities} OPPORTUNITIES)</>
                              )}
                            </>
                          )}
                          {event.type === 'opportunity' && (
                            <>
                              💰 BEST OPPORTUNITY: {event.data.bestAPY.toFixed(2)}% APY
                            </>
                          )}
                          {event.type === 'execution' && (
                            <>
                              {event.data.status === 'started' && '🔄 EXECUTING REALLOCATION...'}
                              {event.data.status === 'completed' && '✅ REALLOCATION COMPLETED!'}
                            </>
                          )}
                          {event.type === 'error' && <>❌ ERROR: {event.data.message}</>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
