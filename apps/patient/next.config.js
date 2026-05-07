const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: [],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb',
    },
  },
  transpilePackages: ['@medassist/shared', '@medassist/ui-clinic'],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@shared': path.resolve(__dirname, '../../packages/shared'),
      '@ui-clinic': path.resolve(__dirname, '../../packages/ui-clinic'),
      // Per-app alias mirrors apps/patient/tsconfig.json "@patient/*": ["./*"].
      // tsconfig paths alone are not always honored by Next 14.2.x's webpack
      // resolver for cross-segment imports inside this app — failing CI run
      // 25475031898 surfaced this. Empirical Lesson #14 (per-app aliases at
      // BOTH levels) — codifying it here too. Matches the @shared/@ui-clinic
      // shape one line up.
      '@patient': path.resolve(__dirname, '.'),
    }
    return config
  },
}

module.exports = nextConfig
