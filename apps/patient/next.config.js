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
  transpilePackages: ['@medassist/shared'],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@shared': path.resolve(__dirname, '../../packages/shared'),
    }
    return config
  },
}

module.exports = nextConfig
