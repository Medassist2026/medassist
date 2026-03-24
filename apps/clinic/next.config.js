const path = require('path')

// next-pwa is optional — build succeeds even if the package is unavailable
let withPWA = (config) => config
try {
  withPWA = require('next-pwa')({
    dest: 'public',
    register: true,
    skipWaiting: true,
    disable: process.env.NODE_ENV === 'development',
    fallbacks: {
      document: '/offline',
    },
    runtimeCaching: [
      // Cache Google Fonts
      {
        urlPattern: /^https:\/\/fonts\.(?:gstatic|googleapis)\.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts',
          expiration: {
            maxEntries: 10,
            maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
          },
        },
      },
      // Cache static assets (JS, CSS, images)
      {
        urlPattern: /\.(?:js|css|png|jpg|jpeg|svg|gif|ico|webp|woff2?)$/i,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'static-assets',
          expiration: {
            maxEntries: 200,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
          },
        },
      },
      // Cache Next.js data fetches
      {
        urlPattern: /\/_next\/data\/.*/i,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'next-data',
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 24 * 60 * 60, // 1 day
          },
          networkTimeoutSeconds: 10,
        },
      },
      // API calls: always go to network, never cache — prevents SW from serving stale
      // auth/registration responses or intercepting in-flight requests
      {
        urlPattern: /\/api\/.*/i,
        handler: 'NetworkOnly',
      },
      // Supabase API calls: always network-only
      {
        urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
        handler: 'NetworkOnly',
      },
      // Navigation routes: network-first
      {
        urlPattern: ({ request }) => request.mode === 'navigate',
        handler: 'NetworkFirst',
        options: {
          cacheName: 'pages',
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 24 * 60 * 60, // 1 day
          },
          networkTimeoutSeconds: 10,
        },
      },
    ],
  })
} catch (e) {
  console.warn('[next.config.js] next-pwa not available, building without PWA support:', e.message)
}

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
    // Resolve @shared/* and @ui-clinic/* aliases to actual package paths
    config.resolve.alias = {
      ...config.resolve.alias,
      '@shared': path.resolve(__dirname, '../../packages/shared'),
      '@ui-clinic': path.resolve(__dirname, '../../packages/ui-clinic'),
    }
    return config
  },
}

module.exports = withPWA(nextConfig)
