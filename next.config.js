/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  transpilePackages: ['@solana/wallet-adapter-react', '@solana/wallet-adapter-react-ui'],
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      stream: require.resolve('stream-browserify'),
      buffer: require.resolve('buffer'),
    };
    config.plugins = config.plugins || [];
    return config;
  },
};

module.exports = nextConfig;
