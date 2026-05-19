/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output creates a self-contained server.js for Azure deployment
  output: 'standalone',
  reactStrictMode: true,
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
