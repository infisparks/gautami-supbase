/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true, // Keep for now. Goal is to make this false.
  },
  images: {
    unoptimized: true, // Set to false for production to enable optimization
  },

  transpilePackages: [
    'recharts',
    'cmdk',
    '@supabase/supabase-js',
    '@supabase/realtime-js',
    // ADD THIS SPECIFIC PACKAGE:
    '@radix-ui/react-progress',
    // If you encounter similar errors in other Radix UI components, add them too:
    // '@radix-ui/react-dialog',
    // '@radix-ui/react-select',
    // etc.
  ],

  webpack: (config, { isServer }) => {
    // Only if the 'Critical dependency' warning from Supabase is still there
    // and you are confident it's not a real issue.
    config.module.exprContextCritical = false;
    return config;
  },
};

module.exports = nextConfig;