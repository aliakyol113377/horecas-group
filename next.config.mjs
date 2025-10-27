/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Temporarily ignore ESLint errors during production builds
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      allowedOrigins: ['*']
    }
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.complex-bar.kz' },
      { protocol: 'https', hostname: '**.supabase.co' }
    ]
  },
  async redirects() {
    return [
      {
        source: '/:lng/product/tarelka-melkaya-dobrushskiy-farforovyy-zavod-03010989',
        destination: '/:lng/product/tarelka-melkaya-idilliya-farfor-d200h22mm-belyj-art-03010989',
        permanent: true
      }
    ]
  },
  // Note: locale routing is handled via middleware + [lng] segment.
}

export default nextConfig
