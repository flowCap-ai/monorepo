'use client';

/**
 * FlowCap Dashboard - Delegate & Connect to OpenClaw
 * Complete flow: Delegate → OpenClaw monitors 24/7
 */

import { useState, useEffect } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { createSmartAccount, generateSessionKey, delegateSessionKey } from '../lib/biconomyClient';
import { getOpenClawClient } from '../lib/openclawClient';

type RiskProfile = 'low' | 'medium' | 'high';

export default function FlowCapDashboard() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [riskProfile, setRiskProfile] = useState<RiskProfile>('low');
  const [maxInvestment, setMaxInvestment] = useState<string>('1000');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // OpenClaw connection state
  const [isOpenClawConnected, setIsOpenClawConnected] = useState(false);
  const [isDelegated, setIsDelegated] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);

  const openclawClient = getOpenClawClient();

  useEffect(() => {
    // Check if already delegated
    const delegated = localStorage.getItem('flowcap-delegated');
    if (delegated === 'true') {
      setIsDelegated(true);
    }

    // Try to connect to OpenClaw automatically
    checkOpenClawConnection();
  }, []);

  const checkOpenClawConnection = async () => {
    try {
      if (!openclawClient.isConnected()) {
        await openclawClient.connect();
      }
      setIsOpenClawConnected(true);
    } catch (err) {
      console.log('OpenClaw not connected yet');
      setIsOpenClawConnected(false);
    }
  };

  /**
   * Step 1: Delegate funds via Biconomy
   */
  const handleDelegate = async () => {
    if (!address || !isConnected) {
      setError('Please connect your wallet first');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('🚀 Starting delegation...');

      // Validate delegation amount
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

      // Generate session key
      const sessionKeyData = generateSessionKey(smartAccount.address, riskProfile, totalDelegationWei);
      console.log('✅ Session key generated');

      // User signs delegation
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

      // Delegate session key on-chain
      const delegationResult = await delegateSessionKey(
        address,
        smartAccount.address,
        sessionKeyData
      );

      if (!delegationResult.success) {
        throw new Error(`Delegation failed: ${delegationResult.error}`);
      }

      console.log('✅ Session key delegated:', delegationResult.txHash);

      // Save delegation info
      localStorage.setItem('flowcap-session-key', sessionKeyData.sessionPrivateKey);
      localStorage.setItem('flowcap-smart-account', smartAccount.address);
      localStorage.setItem('flowcap-risk-profile', riskProfile);
      localStorage.setItem('flowcap-max-investment', maxInvestment);
      localStorage.setItem('flowcap-delegated', 'true');

      setIsDelegated(true);
      console.log('✅ Delegation complete!');

    } catch (err) {
      console.error('❌ Delegation error:', err);
      setError(err instanceof Error ? err.message : 'Delegation failed');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Step 2: Connect to OpenClaw
   */
  const handleConnectOpenClaw = async () => {
    try {
      setError(null);
      setLoading(true);

      await openclawClient.connect();
      setIsOpenClawConnected(true);
      console.log('✅ Connected to OpenClaw');

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to connect to OpenClaw';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Step 3: Start OpenClaw monitoring
   */
  const handleStartMonitoring = async () => {
    try {
      setError(null);
      setLoading(true);

      const sessionKey = localStorage.getItem('flowcap-session-key');
      const smartAccount = localStorage.getItem('flowcap-smart-account');
      const riskProfile = localStorage.getItem('flowcap-risk-profile') || 'low';
      const maxInvestment = localStorage.getItem('flowcap-max-investment') || '1000';

      if (!sessionKey || !smartAccount) {
        throw new Error('Delegation info not found. Please delegate first.');
      }

      // Send configuration to OpenClaw
      const message = `Start FlowCap DeFi monitoring with this configuration:

Smart Account: ${smartAccount}
Session Private Key: ${sessionKey}
Risk Profile: ${riskProfile.toUpperCase()}
Max Investment: $${maxInvestment}

Instructions:
1. Install the FlowCap DeFi skill if not already installed
2. Start autonomous yield monitoring on BNB Chain
3. Scan opportunities every 5 minutes
4. Execute reallocations when profitable after gas costs
5. Follow the ${riskProfile} risk profile restrictions

Run continuously in the background. I will close this dashboard.`;

      const response = await openclawClient.sendAgentMessage(message, {
        thinking: 'medium',
      });

      console.log('✅ OpenClaw monitoring started:', response);
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
  if (isDelegated && isOpenClawConnected && isMonitoring) {
    return (
      <div className="p-6 bg-green-500/10 border-2 border-green-500 rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold text-green-400 font-mono">✅ OPENCLAW MONITORING ACTIVE</h3>
            <p className="text-sm text-gray-400 font-mono mt-2">
              Your DeFi positions are being monitored 24/7
            </p>
          </div>
          <button
            onClick={handleStopMonitoring}
            className="px-6 py-2 bg-red-500/20 text-red-400 border border-red-500/50 rounded-lg hover:bg-red-500/30 font-mono font-bold"
          >
            ⏸️ STOP
          </button>
        </div>

        <div className="bg-black p-4 rounded-lg border border-green-500/30 mt-4">
          <p className="text-sm text-green-400 font-mono">
            🦞 OpenClaw is running autonomously<br />
            💰 Monitoring {localStorage.getItem('flowcap-max-investment')} USD delegation<br />
            🛡️ Risk Profile: {localStorage.getItem('flowcap-risk-profile')?.toUpperCase()}<br />
            <br />
            You can safely close this dashboard. OpenClaw will keep working!
          </p>
        </div>
      </div>
    );
  }

  // Step 1: Delegation
  if (!isDelegated) {
    return (
      <div className="p-6 bg-gray-900 border border-gray-800 rounded-lg">
        <h3 className="text-xl font-bold mb-4 text-orange-400 font-mono">
          STEP 1: DELEGATE FUNDS
        </h3>

        <p className="text-gray-400 mb-6 font-mono text-sm">
          Delegate funds via Biconomy session keys. OpenClaw will manage them autonomously.
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
              className="w-full pl-10 pr-4 py-3 bg-black border-2 border-gray-700 rounded-lg text-white font-mono text-lg focus:border-orange-500 focus:outline-none"
              placeholder="1000"
            />
          </div>
          <p className="text-xs text-gray-500 mt-2 font-mono">
            💡 Minimum: $1 • Maximum depends on risk profile
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
              <div className="text-xs text-gray-500 mt-1 font-mono">+ BNB & staking</div>
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
              <div className="text-xs text-gray-500 mt-1 font-mono">All protocols</div>
              <div className="text-xs text-gray-600 mt-1 font-mono">Max: $50,000</div>
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-lg mb-4">
            <p className="text-sm text-red-400 font-mono">{error}</p>
          </div>
        )}

        <button
          onClick={handleDelegate}
          disabled={loading}
          className="w-full bg-gradient-to-r from-orange-600 to-red-600 text-white px-6 py-4 rounded-lg font-bold hover:from-orange-500 hover:to-red-500 transition disabled:opacity-50 font-mono"
        >
          {loading ? '⏳ DELEGATING...' : '✍️ SIGN & DELEGATE'}
        </button>

        <p className="text-xs text-gray-500 text-center mt-3 font-mono">
          One signature • Session expires in 7 days
        </p>
      </div>
    );
  }

  // Step 2 & 3: Connect OpenClaw & Start Monitoring
  return (
    <div className="p-6 bg-gray-900 border border-gray-800 rounded-lg">
      <h3 className="text-xl font-bold mb-4 text-orange-400 font-mono">
        {!isOpenClawConnected ? 'STEP 2: CONNECT OPENCLAW' : 'STEP 3: START MONITORING'}
      </h3>

      {!isOpenClawConnected ? (
        <>
          <p className="text-gray-400 mb-6 font-mono text-sm">
            Connect to your local OpenClaw instance running on ws://127.0.0.1:18789
          </p>

          <div className="bg-black p-4 rounded-lg border border-gray-700 mb-4">
            <p className="text-xs text-orange-400 font-mono mb-2">
              ℹ️ Make sure OpenClaw is running:
            </p>
            <code className="text-xs text-green-400 font-mono">openclaw status</code>
          </div>

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-lg mb-4">
              <p className="text-sm text-red-400 font-mono">{error}</p>
            </div>
          )}

          <button
            onClick={handleConnectOpenClaw}
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-4 rounded-lg font-bold hover:from-blue-500 hover:to-purple-500 transition disabled:opacity-50 font-mono"
          >
            {loading ? '⏳ CONNECTING...' : '🦞 CONNECT TO OPENCLAW'}
          </button>
        </>
      ) : (
        <>
          <p className="text-gray-400 mb-6 font-mono text-sm">
            ✅ OpenClaw connected! Click below to start autonomous DeFi monitoring.
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
            {loading ? '⏳ STARTING...' : '▶️ START OPENCLAW MONITORING'}
          </button>

          <p className="text-xs text-gray-500 text-center mt-3 font-mono">
            OpenClaw will monitor 24/7 • You can close this dashboard
          </p>
        </>
      )}
    </div>
  );
}
