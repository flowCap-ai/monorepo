import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'FlowCap — Autonomous AI Wealth Manager for DeFi',
  description:
    'AI-powered yield optimization on BNB Chain. One click, one signature, zero configuration. Secured by Biconomy ERC-4337 session keys.',
  openGraph: {
    title: 'FlowCap — AI DeFi Wealth Manager',
    description: 'Autonomous yield optimization on BNB Chain. Non-custodial, 24/7.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} noise`}>{children}</body>
    </html>
  );
}
