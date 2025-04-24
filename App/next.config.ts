import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export', // Add this for static exports compatible with Tauri
  images: {
    unoptimized: true, // Often needed with static exports
  },
  // Keep this comment or remove if no other options are needed
  /* config options here */
};

export default nextConfig;
