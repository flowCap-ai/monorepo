import type { Metadata } from 'next';
import './globals.css';
import { WagmiProviders } from './providers';

export const metadata: Metadata = {
  title: 'FlowCap - Autonomous DeFi Wealth Manager',
  description: 'AI-powered yield optimization on BNB Chain with maximum security',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <WagmiProviders>{children}</WagmiProviders>
      </body>
    </html>
  );
}
