'use client';

import { useEffect, useState } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { Card, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Wallet, LogOut, ExternalLink, Copy, Check } from 'lucide-react';

export function WalletConnect() {
  const { address, isConnected, chain } = useAccount();
  const { disconnect } = useDisconnect();
  const [copied, setCopied] = useState(false);

  const shortenAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isConnected || !address) {
    return (
      <Card className="border-orange-500/15">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="w-14 h-14 rounded-2xl bg-orange-500/10 flex items-center justify-center mb-4">
            <Wallet className="w-7 h-7 text-orange-400/80" />
          </div>
          <p className="text-white font-semibold mb-1">Connect Your Wallet</p>
          <p className="text-sm text-zinc-500 mb-6 text-center max-w-xs">
            Connect a wallet to start delegating yield optimization to CustoFi.
          </p>
          {/* The actual connect button is handled by RainbowKit's ConnectButton in the header */}
          <p className="text-xs text-zinc-600">Use the Connect button in the header</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-surface border border-[var(--border)]">
      {/* Status dot */}
      <div className="relative flex-shrink-0">
        <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center">
          <Wallet className="w-4 h-4 text-orange-400/80" />
        </div>
        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-bg" />
      </div>

      {/* Address + Chain */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-white font-mono">{shortenAddress(address)}</p>
          <button
            onClick={copyAddress}
            className="p-1 rounded-md hover:bg-surface-2 transition-colors"
            title={copied ? 'Copied!' : 'Copy address'}
          >
            {copied ? (
              <Check className="w-3 h-3 text-emerald-400" />
            ) : (
              <Copy className="w-3 h-3 text-zinc-500 hover:text-zinc-300" />
            )}
          </button>
        </div>
        <p className="text-[10px] text-zinc-600 uppercase tracking-wider">
          {chain?.name || 'Unknown Network'}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <a
          href={`https://bscscan.com/address/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 rounded-lg hover:bg-surface-2 transition-colors"
          title="View on BscScan"
        >
          <ExternalLink className="w-3.5 h-3.5 text-zinc-500 hover:text-orange-400" />
        </a>
        <button
          onClick={() => disconnect()}
          className="p-2 rounded-lg hover:bg-red-500/10 transition-colors"
          title="Disconnect"
        >
          <LogOut className="w-3.5 h-3.5 text-zinc-500 hover:text-red-400" />
        </button>
      </div>
    </div>
  );
}

export default WalletConnect;
