import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { WagmiProviders } from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'CustoFi — Dashboard',
  description: 'AI-powered DeFi yield optimization on BNB Chain. Manage your autonomous agent.',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    other: { rel: 'icon', url: '/favicon.svg', type: 'image/svg+xml' },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} noise`}>
        <WagmiProviders>{children}</WagmiProviders>
      </body>
    </html>
  );
}
