/** @type {import('next').NextConfig} */
const nextConfig = {
  // Standalone output creates a self-contained server.js for Azure deployment
  output: 'standalone',
  reactStrictMode: true,
  // E2 — The /api/:path* rewrite was dead code: lib/api.ts uses absolute
  // NEXT_PUBLIC_API_URL for every request. Removed to avoid confusion.
};

module.exports = nextConfig;
