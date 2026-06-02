import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 8015,
    strictPort: true,
    proxy: {
      "/api": {
        target: process.env.API_BASE_URL ?? "http://localhost:8013",
        changeOrigin: true,
      },
    },
  },
});
