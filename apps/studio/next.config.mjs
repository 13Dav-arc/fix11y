const isProd = process.env.NODE_ENV === 'production';
const isCI = process.env.GITHUB_ACTIONS === 'true';
const repoName = 'fix11y';

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@fix11y/core', '@fix11y/agent'],
  output: process.env.NEXT_EXPORT === 'true' ? 'export' : undefined,
  basePath: isCI ? `/${repoName}` : '',
  assetPrefix: isCI ? `/${repoName}/` : '',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
