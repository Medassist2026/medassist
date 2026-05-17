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
    // L-4 / Bundle 6 (2026-05-16): enable Next 14.2 instrumentation hook so
    // apps/patient/instrumentation.ts runs at server boot to initialize
    // Sentry. Flag becomes obsolete in Next 15 (default-on); leave it here
    // until L-7 lands so we don't regress.
    instrumentationHook: true,
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
