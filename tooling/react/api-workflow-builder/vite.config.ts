import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Local dev API (token minting via Express on :5174)
      "/api": {
        target: "http://localhost:5174",
        changeOrigin: true,
      },
      // Corti REST API. Browser hits /corti-eu/... or /corti-us/...; Vite forwards to the real host.
      // Avoids CORS — the browser only sees same-origin requests to localhost:5173.
      "/corti-eu": {
        target: "https://api.eu.corti.app",
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/corti-eu/, ""),
        followRedirects: true,
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            // Logs to the Vite terminal — shows exactly what's hitting Corti.
            // eslint-disable-next-line no-console
            console.log(`[corti-eu →] ${proxyReq.method} ${proxyReq.path}`);
          });
          proxy.on("proxyRes", (proxyRes, req) => {
            // eslint-disable-next-line no-console
            console.log(`[corti-eu ←] ${proxyRes.statusCode} ${req.url}`);
          });
        },
      },
      "/corti-us": {
        target: "https://api.us.corti.app",
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/corti-us/, ""),
        followRedirects: true,
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            // eslint-disable-next-line no-console
            console.log(`[corti-us →] ${proxyReq.method} ${proxyReq.path}`);
          });
          proxy.on("proxyRes", (proxyRes, req) => {
            // eslint-disable-next-line no-console
            console.log(`[corti-us ←] ${proxyRes.statusCode} ${req.url}`);
          });
        },
      },
    },
  },
});
