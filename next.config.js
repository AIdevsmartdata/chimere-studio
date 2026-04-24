/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.alias = { ...config.resolve.alias, '@': __dirname };
    return config;
  },
};
module.exports = nextConfig;
