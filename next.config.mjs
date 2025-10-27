/** @type {import('next').NextConfig} */
const nextConfig = {
  // Remove the hardcoded path for production
  ...(process.env.NODE_ENV === 'development' && {
    outputFileTracingRoot: '/Users/yisindell/Projects/Chef Stacks/chef-stacks',
  }),
  // Ensure heavy native/server-only deps are available at runtime
  serverExternalPackages: ['puppeteer', 'puppeteer-core', '@sparticuz/chromium', 'fluent-ffmpeg'],
  // Reduce development console output
  logging: {
    fetches: {
      fullUrl: false,
    },
  },
  // Suppress some development warnings
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
  // Skip trailing slash redirect
  skipTrailingSlashRedirect: true,
  // Disable ESLint during build for deployment
  eslint: {
    ignoreDuringBuilds: true,
  },
};
export default nextConfig;
