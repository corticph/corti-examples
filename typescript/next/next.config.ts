import path from "node:path";
import type { NextConfig } from "next";

// Absolute path to local SDK so the bundler can resolve it (Turbopack may not
// resolve paths outside the project; use `next dev` without --turbopack).
const cortiSdkEntry = path.resolve(
  process.cwd(),
  "node_modules/@corti/sdk/dist/cjs/index.js"
);

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve ??= {};
    config.resolve.alias = {
      ...config.resolve.alias,
      "@corti/sdk": cortiSdkEntry,
    };
    return config;
  },
};

export default nextConfig;
