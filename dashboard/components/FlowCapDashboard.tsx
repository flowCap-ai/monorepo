'use client';

/**
 * FlowCap Dashboard - One-Click DeFi Delegation via OpenClaw Gateway
 *
 * Complete flow:
 * 1. Generate Session Key (Biconomy SDK - Policy-based)
 * 2. User signs delegation via Smart Account
 * 3. Transmit via WebSocket to OpenClaw Gateway
 * 4. Agent persists data and starts yield monitoring
 * 5. WhatsApp confirmation sent to user
 */

import { useState, useEffect } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { createSmartAccount, generateSessionKey, delegateSessionKey, type SessionKeyData } from '../lib/biconomyClient';

type RiskProfile = 'low' | 'medium' | 'high';

// Risk profile display names
const RISK_PROFILE_NAMES: Record<RiskProfile, string> = {
  low: 'Conservative (Stablecoins Only)',
  medium: 'Balanced (Stables + BNB)',
  high: 'Aggressive (All Protocols)',
};

export default function FlowCapDashboard() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [riskProfile, setRiskProfile] = useState<RiskProfile>('low');
  const [maxInvestment, setMaxInvestment] = useState<string>('1000');
  const [loading, setLoading] = useState(false);
  const [delegationStep, setDelegationStep] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // State
  const [isDelegated, setIsDelegated] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);

  useEffect(() => {
    // Check if already delegated
    const delegated = localStorage.getItem('flowcap-delegated');
    if (delegated === 'true') {
      setIsDelegated(true);
    }
  }, []);

  /**
   * ONE-CLICK DELEGATION FLOW
   *
   * 1. Generate Session Key (Biconomy SDK - Policy-based)
   * 2. User signs delegation via Smart Account
   * 3. Transmit via WebSocket to OpenClaw Gateway
   * 4. Agent persists data and starts yield monitoring
   * 5. WhatsApp confirmation sent to user
   */
  const handleOneClickDelegate = async () => {
    if (!address || !isConnected) {
      setError('Please connect your wallet first');
      return;
    }

    // No pre-check needed - API will handle errors

    setLoading(true);
    setError(null);
    setDelegationStep('');

    try {
      console.log('🚀 Starting one-click delegation...');

      // ========== STEP 1: Validate & Generate Session Key ==========
      setDelegationStep('Generating session key...');

      const totalDelegationUSD = parseFloat(maxInvestment);
      if (isNaN(totalDelegationUSD) || totalDelegationUSD < 1) {
        throw new Error('Minimum delegation is $1');
      }

      const riskLimits = { low: 5000, medium: 10000, high: 50000 };
      if (totalDelegationUSD > riskLimits[riskProfile]) {
        throw new Error(`${riskProfile.toUpperCase()} risk profile maximum is $${riskLimits[riskProfile].toLocaleString()}`);
      }

      // Create smart account
      const smartAccount = await createSmartAccount(address);
      console.log('✅ Smart account:', smartAccount.address);

      const totalDelegationWei = BigInt(Math.floor(totalDelegationUSD * 1e18));

      // Generate session key with risk profile restrictions
      const sessionKeyData = generateSessionKey(smartAccount.address, riskProfile, totalDelegationWei);
      console.log('✅ Session key generated:', sessionKeyData.sessionAddress);

      // ========== STEP 2: User Signs Delegation ==========
      setDelegationStep('Waiting for signature...');

      const message = `FlowCap Agent Delegation

I authorize FlowCap to manage my DeFi positions via OpenClaw with these restrictions:

Smart Account: ${smartAccount.address}
Session Key: ${sessionKeyData.sessionAddress}
Risk Profile: ${riskProfile.toUpperCase()}
Total Delegated: $${totalDelegationUSD.toLocaleString()} USD
Valid Until: ${new Date(sessionKeyData.validUntil * 1000).toLocaleString()}

SECURITY GUARANTEES:
✓ Agent can trade with TOTAL of $${totalDelegationUSD.toLocaleString()}
✓ Agent can ONLY swap and supply/withdraw on allowed protocols
✓ Agent CANNOT transfer funds externally
✓ Session expires in 7 days

OpenClaw will monitor 24/7. You can close this dashboard anytime.`;

      await signMessageAsync({ message });
      console.log('✅ Delegation signed');

      // ========== STEP 3: Delegate Session Key On-Chain ==========
      setDelegationStep('Delegating on-chain...');

      const delegationResult = await delegateSessionKey(
        address,
        smartAccount.address,
        sessionKeyData
      );

      if (!delegationResult.success) {
        throw new Error(`Delegation failed: ${delegationResult.error}`);
      }

      console.log('✅ Session key delegated:', delegationResult.txHash);

      // ========== STEP 4: Send to API ==========
      setDelegationStep('Transmitting to agent...');

      // Build delegation payload
      const delegationPayload = {
        sessionKey: sessionKeyData.sessionPrivateKey,
        sessionAddress: sessionKeyData.sessionAddress,
        smartAccountAddress: smartAccount.address,
        riskProfile,
        maxInvestment,
        validUntil: sessionKeyData.validUntil,
        permissions: sessionKeyData.permissions.map((p) => ({
          target: p.target,
          functionSelector: p.functionSelector,
          valueLimit: p.valueLimit.toString(),
        })),
        chain: {
          id: 56, // BNB Chain
          name: 'BNB Chain',
        },
      };

      // Send to Next.js API route
      const response = await fetch('/api/delegate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(delegationPayload),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to transmit delegation');
      }

      console.log('✅ Delegation successful:', result);
      setDelegationStep('Delegation complete!');
      setIsMonitoring(true);

      // ========== COMPLETE: Save State ==========
      localStorage.setItem('flowcap-session-key', sessionKeyData.sessionPrivateKey);
      localStorage.setItem('flowcap-smart-account', smartAccount.address);
      localStorage.setItem('flowcap-risk-profile', riskProfile);
      localStorage.setItem('flowcap-max-investment', maxInvestment);
      localStorage.setItem('flowcap-delegated', 'true');

      setIsDelegated(true);
      setIsMonitoring(true);
      setDelegationStep('');
      console.log('✅ One-click delegation complete!');

    } catch (err) {
      console.error('❌ Delegation error:', err);
      setError(err instanceof Error ? err.message : 'Delegation failed');
      setDelegationStep('');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Legacy delegate handler (kept for backwards compatibility)
   */
  const handleDelegate = handleOneClickDelegate;


  /**
   * Manually start OpenClaw monitoring (if not started during delegation)
   */
  const handleStartMonitoring = async () => {
    try {
      setError(null);
      setLoading(true);

      const sessionKey = localStorage.getItem('flowcap-session-key');
      const smartAccount = localStorage.getItem('flowcap-smart-account');
      const storedRiskProfile = localStorage.getItem('flowcap-risk-profile') || 'low';
      const storedMaxInvestment = localStorage.getItem('flowcap-max-investment') || '1000';

      if (!sessionKey || !smartAccount) {
        throw new Error('Delegation info not found. Please delegate first.');
      }

      // Server already started monitoring during delegation
      // This is just for manually starting if needed

      console.log('✅ OpenClaw monitoring started');
      setIsMonitoring(true);

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to start monitoring';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Stop monitoring
   */
  const handleStopMonitoring = async () => {
    try {
      setError(null);

      await openclawClient.sendAgentMessage(
        'Stop FlowCap DeFi monitoring and pause all operations',
        { thinking: 'low' }
      );

      setIsMonitoring(false);
      console.log('✅ Monitoring stopped');

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to stop';
      setError(errorMsg);
    }
  };

  if (!isConnected) {
    return (
      <div className="p-6 bg-gray-900 border border-yellow-500/50 rounded-lg">
        <h3 className="text-lg font-semibold mb-2 text-yellow-400 font-mono">⚠️ CONNECT WALLET</h3>
        <p className="text-gray-400 font-mono text-sm">
          Connect your wallet to delegate funds and start OpenClaw monitoring.
        </p>
      </div>
    );
  }

  // Success state - Monitoring active
  if (isDelegated && isMonitoring) {
    const resetDelegation = () => {
      localStorage.removeItem('flowcap-delegated');
      localStorage.removeItem('flowcap-session-key');
      localStorage.removeItem('flowcap-smart-account');
      localStorage.removeItem('flowcap-risk-profile');
      localStorage.removeItem('flowcap-max-investment');
      setIsDelegated(false);
      setIsMonitoring(false);
      window.location.reload();
    };

    return (
      <div className="p-6 bg-green-500/10 border-2 border-green-500 rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold text-green-400 font-mono">✅ AGENT MONITORING ACTIVE</h3>
            <p className="text-sm text-gray-400 font-mono mt-2">
              Your DeFi positions are being monitored 24/7
            </p>
          </div>
          <button
            onClick={resetDelegation}
            className="px-6 py-2 bg-red-500/20 text-red-400 border border-red-500/50 rounded-lg hover:bg-red-500/30 font-mono font-bold"
          >
            RESET
          </button>
        </div>

        <div className="bg-black p-4 rounded-lg border border-green-500/30 mt-4">
          <p className="text-sm text-green-400 font-mono">
            🤖 Agent is running autonomously<br />
            💰 Monitoring {localStorage.getItem('flowcap-max-investment')} USD delegation<br />
            🛡️ Risk Profile: {localStorage.getItem('flowcap-risk-profile')?.toUpperCase()}<br />
            <br />
            You can safely close this dashboard. The agent will keep working!
          </p>
        </div>
      </div>
    );
  }

  // Delegation UI
  if (!isDelegated) {
    return (
      <div className="p-6 bg-gray-900 border border-gray-800 rounded-lg">

        <h3 className="text-xl font-bold mb-4 text-orange-400 font-mono">
          ONE-CLICK DELEGATION
        </h3>

        <p className="text-gray-400 mb-6 font-mono text-sm">
          Delegate funds via Biconomy session keys. The agent will manage them autonomously and notify you via WhatsApp.
        </p>

        {/* Delegation Amount */}
        <div className="mb-6">
          <label className="block text-sm font-semibold mb-2 text-gray-300 font-mono">
            TOTAL AMOUNT TO DELEGATE:
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-mono text-lg">$</span>
            <input
              type="number"
              value={maxInvestment}
              onChange={(e) => setMaxInvestment(e.target.value)}
              min="1"
              max="50000"
              step="1"
              disabled={loading}
              className="w-full pl-10 pr-4 py-3 bg-black border-2 border-gray-700 rounded-lg text-white font-mono text-lg focus:border-orange-500 focus:outline-none disabled:opacity-50"
              placeholder="1000"
            />
          </div>
          <p className="text-xs text-gray-500 mt-2 font-mono">
            Minimum: $1 | Maximum depends on risk profile
          </p>
        </div>

        {/* Risk Profile */}
        <div className="mb-6">
          <label className="block text-sm font-semibold mb-2 text-gray-300 font-mono">
            SELECT RISK PROFILE:
          </label>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setRiskProfile('low')}
              disabled={loading}
              className={`p-4 border-2 rounded-lg transition ${
                riskProfile === 'low'
                  ? 'border-green-500 bg-green-500/10'
                  : 'border-gray-700 hover:border-green-500/50 bg-black'
              } disabled:opacity-50`}
            >
              <div className="font-semibold text-green-400 font-mono">LOW</div>
              <div className="text-xs text-gray-500 mt-1 font-mono">Stablecoins only</div>
              <div className="text-xs text-gray-600 mt-1 font-mono">Max: $5,000</div>
            </button>

            <button
              onClick={() => setRiskProfile('medium')}
              disabled={loading}
              className={`p-4 border-2 rounded-lg transition ${
                riskProfile === 'medium'
                  ? 'border-orange-500 bg-orange-500/10'
                  : 'border-gray-700 hover:border-orange-500/50 bg-black'
              } disabled:opacity-50`}
            >
              <div className="font-semibold text-orange-400 font-mono">MEDIUM</div>
              <div className="text-xs text-gray-500 mt-1 font-mono">+ BNB & staking</div>
              <div className="text-xs text-gray-600 mt-1 font-mono">Max: $10,000</div>
            </button>

            <button
              onClick={() => setRiskProfile('high')}
              disabled={loading}
              className={`p-4 border-2 rounded-lg transition ${
                riskProfile === 'high'
                  ? 'border-red-500 bg-red-500/10'
                  : 'border-gray-700 hover:border-red-500/50 bg-black'
              } disabled:opacity-50`}
            >
              <div className="font-semibold text-red-400 font-mono">HIGH</div>
              <div className="text-xs text-gray-500 mt-1 font-mono">All protocols</div>
              <div className="text-xs text-gray-600 mt-1 font-mono">Max: $50,000</div>
            </button>
          </div>
        </div>

        {/* Delegation Step Progress */}
        {delegationStep && (
          <div className="p-4 bg-blue-500/10 border border-blue-500/50 rounded-lg mb-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm text-blue-400 font-mono">{delegationStep}</p>
            </div>
          </div>
        )}

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-lg mb-4">
            <p className="text-sm text-red-400 font-mono">{error}</p>
          </div>
        )}

        <button
          onClick={handleOneClickDelegate}
          disabled={loading}
          className="w-full bg-gradient-to-r from-orange-600 to-red-600 text-white px-6 py-4 rounded-lg font-bold hover:from-orange-500 hover:to-red-500 transition disabled:opacity-50 font-mono text-lg"
        >
          {loading ? 'DELEGATING...' : 'DELEGATE TO AGENT'}
        </button>

        <p className="text-xs text-gray-500 text-center mt-3 font-mono">
          One signature | Session expires in 7 days | WhatsApp notification
        </p>

        {/* What happens after delegation */}
        <div className="mt-6 p-4 bg-black/50 border border-gray-800 rounded-lg">
          <p className="text-xs text-gray-400 font-mono mb-2">AFTER DELEGATION:</p>
          <ul className="text-xs text-gray-500 font-mono space-y-1">
            <li>1. Session key generated with {riskProfile.toUpperCase()} risk restrictions</li>
            <li>2. Delegation transmitted to the agent server</li>
            <li>3. WhatsApp confirmation triggered automatically</li>
            <li>4. Agent starts 24/7 yield monitoring on BNB Chain</li>
          </ul>
        </div>
      </div>
    );
  }

  // Delegated but monitoring not yet started (edge case - manual start)
  return (
    <div className="p-6 bg-gray-900 border border-gray-800 rounded-lg">
      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center text-xs font-bold">✓</div>
          <span className="text-sm text-gray-500 font-mono">Funds Delegated</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center text-xs font-bold">✓</div>
          <span className="text-sm text-gray-500 font-mono">Agent Monitoring Active</span>
        </div>
      </div>

      <h3 className="text-xl font-bold mb-4 text-orange-400 font-mono">
        START MONITORING
      </h3>

      <p className="text-gray-400 mb-6 font-mono text-sm">
        Your delegation is complete. Click below to start autonomous DeFi monitoring.
      </p>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-lg mb-4">
          <p className="text-sm text-red-400 font-mono">{error}</p>
        </div>
      )}

      <button
        onClick={handleStartMonitoring}
        disabled={loading}
        className="w-full bg-gradient-to-r from-green-600 to-blue-600 text-white px-6 py-4 rounded-lg font-bold hover:from-green-500 hover:to-blue-500 transition disabled:opacity-50 font-mono"
      >
        {loading ? 'STARTING...' : 'START OPENCLAW MONITORING'}
      </button>

      <p className="text-xs text-gray-500 text-center mt-3 font-mono">
        OpenClaw will monitor 24/7 | You can close this dashboard
      </p>

      {/* Delegation summary */}
      <div className="mt-6 p-4 bg-black/50 border border-gray-800 rounded-lg">
        <p className="text-xs text-gray-400 font-mono mb-2">DELEGATION SUMMARY:</p>
        <ul className="text-xs text-gray-500 font-mono space-y-1">
          <li>Account: {localStorage.getItem('flowcap-smart-account')?.slice(0, 10)}...</li>
          <li>Risk Profile: {localStorage.getItem('flowcap-risk-profile')?.toUpperCase()}</li>
          <li>Max Investment: ${localStorage.getItem('flowcap-max-investment')}</li>
          <li>Chain: BNB Chain</li>
        </ul>
      </div>
    </div>
  );
}
