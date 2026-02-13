import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { bsc } from 'wagmi/chains';

export const wagmiConfig = getDefaultConfig({
  appName: 'FlowCap',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '395c1a744ab557059e1270a739201207',
  chains: [bsc],
  ssr: true,
});
