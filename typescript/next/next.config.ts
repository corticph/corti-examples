import path from "node:path";
import type { NextConfig } from "next";

// ESM build required: React Refresh injects import.meta.webpackHot in dev; CJS can't parse it.
const cortiSdkEntry = path.resolve(
  process.cwd(),
  "node_modules/@corti/sdk/dist/esm/index.mjs"
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
