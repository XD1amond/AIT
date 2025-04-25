import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export', // Add this for static exports compatible with Tauri
  images: {
    unoptimized: true, // Often needed with static exports
  },
  // Configure webpack to handle Node.js modules in browser environment
  webpack: (config, { isServer }) => {
    // If it's a client-side build (browser)
    if (!isServer) {
      // Replace Node.js modules with empty modules
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        child_process: false,
        os: false,
        path: false,
        crypto: false,
      };
    }
    return config;
  },
};

export default nextConfig;
