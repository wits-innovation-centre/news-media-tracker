/** @type {import('next').NextConfig} */
const configuredBasePath = process.env.NEXT_PUBLIC_BASE_PATH || '/homicidetracker';
const normalisedBasePath =
  configuredBasePath === '/'
    ? ''
    : `/${configuredBasePath.replace(/^\/+|\/+$/g, '')}`;
const isDevelopment = process.env.NODE_ENV === 'development';

const nextConfig = {
  assetPrefix: isDevelopment ? undefined : normalisedBasePath || undefined,

  env: {
    NEXT_PUBLIC_BASE_PATH: normalisedBasePath,
  },

  // Use standalone output only in production for Electron compatibility
  // In development, run normally for better dev experience
  // ...(process.env.NODE_ENV === 'production' && { output: 'standalone' }),

  // Configure webpack for Electron compatibility
  webpack: (config, { isServer, dev }) => {
    // Don't bundle these packages - they'll be available in the Electron environment
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
        stream: false,
        buffer: false,
      };
    }

    return config;
  },

  // Keep TypeScript and ESLint checking enabled for better development experience
  typescript: {
    ignoreBuildErrors: false,
  },

  eslint: {
    ignoreDuringBuilds: false,
  },

  async headers() {
    if (process.env.NODE_ENV !== 'development') {
      return [];
    }

    // Prevent stale HTML/chunk manifests from being reused across dev restarts.
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'Expires',
            value: '0',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
