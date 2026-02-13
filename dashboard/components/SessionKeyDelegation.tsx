'use client';

/**
 * Session Key Delegation Component
 * Allows users to delegate permissions to the FlowCap agent
 */

import { useState } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import {
  createSmartAccount,
  generateSessionKey,
  delegateSessionKey,
  encryptSessionKey,
  type SessionKeyData,
} from '../lib/biconomyClient';

type RiskProfile = 'low' | 'medium' | 'high';

export default function SessionKeyDelegation() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [riskProfile, setRiskProfile] = useState<RiskProfile>('low');
  const [loading, setLoading] = useState(false);
  const [sessionKey, setSessionKey] = useState<SessionKeyData | null>(null);
  const [delegationComplete, setDelegationComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelegateSessionKey = async () => {
    if (!address || !isConnected) {
      setError('Please connect your wallet first');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Step 1: Create or get smart account
      console.log('Creating smart account for', address);
      const smartAccount = await createSmartAccount(address);
      console.log('Smart account:', smartAccount.address);

      // Step 2: Generate session key with FlowCap permissions
      console.log('Generating session key...');
      const sessionKeyData = generateSessionKey(smartAccount.address);
      setSessionKey(sessionKeyData);

      console.log('Session key generated:', sessionKeyData.sessionAddress);
      console.log('Permissions:', sessionKeyData.permissions.length);

      // Step 3: Request user signature to authorize session key
      console.log('Requesting signature...');
      const message = `FlowCap Session Key Delegation

You are authorizing the FlowCap agent to manage your yield positions with these restrictions:

Risk Profile: ${riskProfile.toUpperCase()}
Smart Account: ${smartAccount.address}
Session Key: ${sessionKeyData.sessionAddress}
Valid Until: ${new Date(sessionKeyData.validUntil * 1000).toLocaleString()}

SECURITY GUARANTEES:
✓ Agent can ONLY swap and supply/withdraw on allowed protocols
✓ Agent CANNOT transfer your funds to external addresses
✓ Agent CANNOT exceed maximum transaction limits
✓ Session expires in 7 days

Allowed Operations:
- Swap tokens on PancakeSwap
- Supply/withdraw on Venus Protocol
- Approve tokens for swaps and lending

By signing this message, you authorize the FlowCap agent to optimize your yield within the ${riskProfile} risk profile boundaries.`;

      const signature = await signMessageAsync({ message });
      console.log('Signature obtained');

      // Step 4: Store delegation data
      const delegationData = {
        smartAccountAddress: smartAccount.address,
        sessionKey: sessionKeyData,
        riskProfile,
        signature,
        timestamp: Date.now(),
      };

      // Step 5: Encrypt and display session key for agent
      const encryptedKey = encryptSessionKey(
        sessionKeyData.sessionPrivateKey,
        `${address}-${Date.now()}`
      );

      // In production, this would be securely transmitted to the agent
      // For now, display it for the user to copy
      console.log('Delegation complete!');
      console.log('Encrypted session key:', encryptedKey);

      setDelegationComplete(true);

      // Step 6: Save to local storage (in production, use secure backend)
      if (typeof window !== 'undefined') {
        localStorage.setItem(
          `flowcap-delegation-${address}`,
          JSON.stringify({
            ...delegationData,
            encryptedSessionKey: encryptedKey,
          })
        );
      }
    } catch (err) {
      console.error('Delegation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to delegate session key');
    } finally {
      setLoading(false);
    }
  };

  const handleCopySessionKey = () => {
    if (!sessionKey) return;

    // Copy session key to clipboard for agent setup
    const agentConfig = `
# Add these to your .env file for the FlowCap agent:

AGENT_WALLET_ADDRESS=${address}
SESSION_PRIVATE_KEY=${sessionKey.sessionPrivateKey}
RISK_PROFILE=${riskProfile}

# Session expires: ${new Date(sessionKey.validUntil * 1000).toLocaleString()}
`;

    navigator.clipboard.writeText(agentConfig);
    alert('Session key configuration copied to clipboard!');
  };

  if (!isConnected) {
    return (
      <div className="p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
        <h3 className="text-lg font-semibold mb-2">Connect Wallet Required</h3>
        <p className="text-gray-700">Please connect your wallet to delegate permissions to the FlowCap agent.</p>
      </div>
    );
  }

  if (delegationComplete && sessionKey) {
    return (
      <div className="space-y-6">
        <div className="p-6 bg-green-50 border border-green-200 rounded-lg">
          <h3 className="text-xl font-bold mb-4 text-green-800">✅ Session Key Delegated Successfully!</h3>

          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-gray-700">Session Key Address:</p>
              <p className="text-xs font-mono bg-white p-2 rounded border break-all">
                {sessionKey.sessionAddress}
              </p>
            </div>

            <div>
              <p className="text-sm font-semibold text-gray-700">Valid Until:</p>
              <p className="text-sm">{new Date(sessionKey.validUntil * 1000).toLocaleString()}</p>
            </div>

            <div>
              <p className="text-sm font-semibold text-gray-700">Permissions:</p>
              <p className="text-sm">{sessionKey.permissions.length} operations allowed</p>
            </div>

            <div>
              <p className="text-sm font-semibold text-gray-700">Risk Profile:</p>
              <p className="text-sm capitalize">{riskProfile}</p>
            </div>
          </div>
        </div>

        <div className="p-6 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="text-lg font-semibold mb-3">🤖 Next Step: Configure Your Agent</h4>

          <p className="text-sm mb-4">
            Copy the session key configuration and add it to your agent's <code>.env</code> file:
          </p>

          <button
            onClick={handleCopySessionKey}
            className="w-full bg-blue-600 text-white px-4 py-3 rounded-lg font-semibold hover:bg-blue-700 transition"
          >
            📋 Copy Agent Configuration
          </button>

          <div className="mt-4 p-4 bg-white rounded border">
            <p className="text-xs font-mono text-gray-600">
              AGENT_WALLET_ADDRESS={address}
              <br />
              SESSION_PRIVATE_KEY=0x****
              <br />
              RISK_PROFILE={riskProfile}
            </p>
          </div>

          <p className="text-xs text-gray-600 mt-4">
            ⚠️ Keep your session key private! Anyone with this key can execute authorized operations within the
            delegated permissions.
          </p>
        </div>

        <div className="p-4 bg-gray-50 rounded-lg">
          <h4 className="text-sm font-semibold mb-2">📚 What happens next?</h4>
          <ol className="text-sm space-y-1 list-decimal list-inside">
            <li>Your agent will monitor yield opportunities every 5 minutes</li>
            <li>When a better opportunity is found, it will analyze profitability</li>
            <li>If profitable after gas costs, it will execute the reallocation</li>
            <li>You'll receive notifications via Telegram (if configured)</li>
            <li>All transactions are verifiable on BscScan</li>
          </ol>
        </div>

        <button
          onClick={() => {
            setDelegationComplete(false);
            setSessionKey(null);
          }}
          className="text-sm text-gray-600 hover:text-gray-800"
        >
          ← Create New Delegation
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="p-6 bg-white border rounded-lg shadow-sm">
        <h3 className="text-xl font-bold mb-4">Delegate Permissions to FlowCap Agent</h3>

        <p className="text-gray-700 mb-6">
          Grant the FlowCap AI agent limited permissions to optimize your yield positions. The agent operates with
          strict security boundaries and cannot transfer your funds to external addresses.
        </p>

        <div className="space-y-4">
          {/* Risk Profile Selection */}
          <div>
            <label className="block text-sm font-semibold mb-2">Select Risk Profile:</label>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => setRiskProfile('low')}
                className={`p-4 border-2 rounded-lg transition ${
                  riskProfile === 'low'
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-200 hover:border-green-300'
                }`}
              >
                <div className="font-semibold text-green-700">🛡️ Low</div>
                <div className="text-xs text-gray-600 mt-1">Stablecoins only</div>
              </button>

              <button
                onClick={() => setRiskProfile('medium')}
                className={`p-4 border-2 rounded-lg transition ${
                  riskProfile === 'medium'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-blue-300'
                }`}
              >
                <div className="font-semibold text-blue-700">⚖️ Medium</div>
                <div className="text-xs text-gray-600 mt-1">+ Liquid staking</div>
              </button>

              <button
                onClick={() => setRiskProfile('high')}
                className={`p-4 border-2 rounded-lg transition ${
                  riskProfile === 'high'
                    ? 'border-orange-500 bg-orange-50'
                    : 'border-gray-200 hover:border-orange-300'
                }`}
              >
                <div className="font-semibold text-orange-700">🚀 High</div>
                <div className="text-xs text-gray-600 mt-1">+ Volatile assets</div>
              </button>
            </div>
          </div>

          {/* Security Guarantees */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <h4 className="text-sm font-semibold mb-2">🔒 Security Guarantees:</h4>
            <ul className="text-sm space-y-1">
              <li className="flex items-start">
                <span className="text-green-600 mr-2">✓</span>
                <span>Agent can ONLY swap and supply/withdraw on whitelisted protocols</span>
              </li>
              <li className="flex items-start">
                <span className="text-green-600 mr-2">✓</span>
                <span>Agent CANNOT transfer funds to external addresses (anti-drainage)</span>
              </li>
              <li className="flex items-start">
                <span className="text-green-600 mr-2">✓</span>
                <span>Maximum transaction limit: 10,000 USD equivalent</span>
              </li>
              <li className="flex items-start">
                <span className="text-green-600 mr-2">✓</span>
                <span>Session key expires in 7 days (renewable)</span>
              </li>
              <li className="flex items-start">
                <span className="text-green-600 mr-2">✓</span>
                <span>All operations verifiable on-chain via BscScan</span>
              </li>
            </ul>
          </div>

          {/* Allowed Protocols */}
          <div className="p-4 bg-blue-50 rounded-lg">
            <h4 className="text-sm font-semibold mb-2">🌐 Allowed Protocols:</h4>
            <ul className="text-sm space-y-1">
              <li>• PancakeSwap (DEX) - Token swaps</li>
              <li>• Venus Protocol - Lending/borrowing</li>
            </ul>
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Delegate Button */}
          <button
            onClick={handleDelegateSessionKey}
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white px-6 py-4 rounded-lg font-semibold hover:from-blue-700 hover:to-purple-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '⏳ Delegating...' : '🔑 Delegate Session Key'}
          </button>

          <p className="text-xs text-gray-500 text-center">
            By clicking "Delegate Session Key", you'll be asked to sign a message authorizing the FlowCap agent with
            the permissions above.
          </p>
        </div>
      </div>
    </div>
  );
}
