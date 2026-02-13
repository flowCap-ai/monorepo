'use client';

import { useState, useEffect } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import { PoolsTable } from '@/components/PoolsTable';
import { RiskSelector } from '@/components/RiskSelector';

export default function Home() {
  const { address, isConnected } = useAccount();
  const [riskProfile, setRiskProfile] = useState<'low' | 'medium' | 'high'>('low');

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      {/* Header */}
      <header className="border-b border-gray-800 backdrop-blur-sm bg-black/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <div className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">
                FlowCap
              </div>
              <span className="text-sm text-gray-400 hidden sm:block">
                Autonomous DeFi Wealth Manager
              </span>
            </div>
            <ConnectButton />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!isConnected ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div className="text-center space-y-6">
              <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-400 via-pink-500 to-purple-600 bg-clip-text text-transparent">
                Welcome to FlowCap
              </h1>
              <p className="text-xl text-gray-300 max-w-2xl">
                AI-powered autonomous yield optimization on BNB Chain
              </p>
              <div className="flex flex-col items-center space-y-4 pt-8">
                <p className="text-gray-400">Connect your wallet to get started</p>
                <ConnectButton />
              </div>

              {/* Features */}
              <div className="grid md:grid-cols-3 gap-6 pt-12 text-left">
                <div className="bg-gray-800/50 backdrop-blur-sm p-6 rounded-lg border border-gray-700">
                  <h3 className="text-lg font-semibold mb-2 text-purple-400">AI Agent</h3>
                  <p className="text-gray-400 text-sm">
                    OpenClaw AI discovers and analyzes 76+ pools across Venus, PancakeSwap, and Lista
                  </p>
                </div>
                <div className="bg-gray-800/50 backdrop-blur-sm p-6 rounded-lg border border-gray-700">
                  <h3 className="text-lg font-semibold mb-2 text-pink-400">Session Keys</h3>
                  <p className="text-gray-400 text-sm">
                    Delegate execution power via Account Abstraction - secure and gas-efficient
                  </p>
                </div>
                <div className="bg-gray-800/50 backdrop-blur-sm p-6 rounded-lg border border-gray-700">
                  <h3 className="text-lg font-semibold mb-2 text-purple-400">Dynamic Yield</h3>
                  <p className="text-gray-400 text-sm">
                    Real-time APY calculations and risk scoring for optimal allocation
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Connected User Info */}
            <div className="bg-gradient-to-r from-purple-900/30 to-pink-900/30 backdrop-blur-sm p-6 rounded-lg border border-purple-500/20">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold mb-2">Dashboard</h2>
                  <p className="text-gray-400">Connected: {address}</p>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-400">Network</div>
                  <div className="text-lg font-semibold">BNB Smart Chain</div>
                </div>
              </div>
            </div>

            {/* Risk Profile Selector */}
            <RiskSelector value={riskProfile} onChange={setRiskProfile} />

            {/* Pools Table */}
            <PoolsTable riskProfile={riskProfile} />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center text-gray-500 text-sm">
            <p>FlowCap - Powered by OpenClaw AI Agent</p>
            <p className="mt-1">Built on BNB Chain with Account Abstraction (ERC-4337)</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
