'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import FlowCapDashboard from '../components/FlowCapDashboard';

export default function Home() {
  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="border-b border-gray-800 bg-black/95 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <img src="/hashfoxblack.png" alt="HashFox Labs" className="h-16 w-16" />
            <div>
              <h1 className="text-3xl font-bold text-white">
                FlowCap
              </h1>
              <p className="text-sm text-gray-400">by HashFox Labs</p>
            </div>
          </div>
          <ConnectButton />
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold mb-4 text-white">
            Start Your AI Wealth Manager in 30 Seconds
          </h2>
          <p className="text-xl text-orange-400 mb-2 font-mono">
            One Click • One Signature • Zero Configuration
          </p>
          <p className="text-sm text-gray-500 font-mono">
            Powered by OpenClaw AI • Secured by Biconomy Session Keys • Built on BNB Chain
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-12">
          <div className="bg-gray-900 p-6 rounded-lg border border-gray-800 hover:border-orange-500/50 transition">
            <div className="text-3xl mb-3">🛡️</div>
            <h3 className="font-semibold mb-2 text-white">Maximum Security</h3>
            <p className="text-sm text-gray-400 font-mono text-xs">
              Agent cannot transfer funds externally. All operations restricted by session keys.
            </p>
          </div>

          <div className="bg-gray-900 p-6 rounded-lg border border-gray-800 hover:border-orange-500/50 transition">
            <div className="text-3xl mb-3">🤖</div>
            <h3 className="font-semibold mb-2 text-white">AI-Powered</h3>
            <p className="text-sm text-gray-400 font-mono text-xs">
              Claude AI analyzes opportunities 24/7 and acts only when profitable.
            </p>
          </div>

          <div className="bg-gray-900 p-6 rounded-lg border border-gray-800 hover:border-orange-500/50 transition">
            <div className="text-3xl mb-3">🔗</div>
            <h3 className="font-semibold mb-2 text-white">On-Chain Verified</h3>
            <p className="text-sm text-gray-400 font-mono text-xs">
              Every transaction is verifiable on BscScan. Full transparency guaranteed.
            </p>
          </div>
        </div>

        {/* FlowCap Dashboard - Delegate & Start OpenClaw */}
        <FlowCapDashboard />

        {/* Info Section */}
        <div className="mt-12 p-6 bg-gray-900 rounded-lg border border-gray-800">
          <h3 className="text-lg font-semibold mb-4 text-orange-400 font-mono">HOW IT WORKS</h3>
          <div className="space-y-3 text-sm text-gray-400">
            <div className="flex gap-3">
              <div className="font-bold text-orange-400 font-mono">01.</div>
              <div className="font-mono text-xs">
                <strong className="text-white">Connect & Start:</strong> Connect your wallet and click "Start Agent" - that's it!
                No configuration files, no servers, no technical setup.
              </div>
            </div>
            <div className="flex gap-3">
              <div className="font-bold text-orange-400 font-mono">02.</div>
              <div className="font-mono text-xs">
                <strong className="text-white">Sign Once:</strong> Sign one message to delegate restricted permissions.
                Agent can ONLY optimize yields, cannot transfer funds externally.
              </div>
            </div>
            <div className="flex gap-3">
              <div className="font-bold text-orange-400 font-mono">03.</div>
              <div className="font-mono text-xs">
                <strong className="text-white">AI Monitors 24/7:</strong> Your personal agent scans opportunities every 5 minutes,
                analyzes profitability after gas costs, and acts only when beneficial.
              </div>
            </div>
            <div className="flex gap-3">
              <div className="font-bold text-orange-400 font-mono">04.</div>
              <div className="font-mono text-xs">
                <strong className="text-white">Watch in Real-Time:</strong> See your agent's activity live - scanning, finding
                opportunities, executing optimizations. Pause or stop anytime.
              </div>
            </div>
          </div>
        </div>

        {/* Supported Protocols */}
        <div className="mt-8 p-6 bg-gray-900 rounded-lg border border-gray-800">
          <h3 className="text-lg font-semibold mb-4 text-center text-orange-400 font-mono">SUPPORTED PROTOCOLS</h3>
          <div className="flex flex-wrap justify-center gap-4 text-sm">
            <span className="px-4 py-2 bg-black rounded border border-gray-800 font-mono text-white text-xs hover:border-orange-500/50 transition">
              🪙 Venus Protocol
            </span>
            <span className="px-4 py-2 bg-black rounded border border-gray-800 font-mono text-white text-xs hover:border-orange-500/50 transition">
              🥞 PancakeSwap
            </span>
            <span className="px-4 py-2 bg-black rounded border border-gray-800 font-mono text-white text-xs hover:border-orange-500/50 transition">
              📊 Lista DAO
            </span>
            <span className="px-4 py-2 bg-black rounded border border-gray-800 font-mono text-white text-xs hover:border-orange-500/50 transition">
              🦙 Alpaca Finance
            </span>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-20 py-8 text-center text-sm text-gray-500">
        <p className="font-mono">Built with ❤️ by <span className="text-orange-400">HashFox Labs</span></p>
        <p className="mt-2 font-mono text-xs">
          Open Source •{' '}
          <a href="https://github.com/flowCap-ai/monorepo" className="text-orange-400 hover:text-orange-300 transition">
            GitHub
          </a>{' '}
          •{' '}
          <a href="/docs" className="text-orange-400 hover:text-orange-300 transition">
            Documentation
          </a>
        </p>
      </footer>
    </div>
  );
}
