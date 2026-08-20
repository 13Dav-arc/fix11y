/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@fix11y/core'],
  output: 'export',
  images: {
    unoptimized: true
  }
};

export default nextConfig;
