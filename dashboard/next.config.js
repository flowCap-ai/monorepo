/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  reactStrictMode: true,
  // Cross-package imports (../agents/) have their own tsconfig — skip type check here
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    // Alias React Native module used by @metamask/sdk browser bundle
    config.resolve.alias['@react-native-async-storage/async-storage'] = false;
    // Fix porto/internal export mismatch with wagmi connectors
    config.resolve.alias['porto/internal'] = false;
    // Allow imports from ../agents/ to resolve node_modules from this project
    config.resolve.modules = [
      path.resolve(__dirname, 'node_modules'),
      'node_modules',
    ];
    return config;
  },
  // Allow Service Worker in public directory
  async headers() {
    return [
      {
        source: '/service-worker.js',
        headers: [
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
