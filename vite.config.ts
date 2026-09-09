import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.BASE_PATH || "/",
  build: { target: "es2020" },
  server: {
    host: "127.0.0.1",
    port: 4611,
    proxy: {
      "/api": { target: "http://127.0.0.1:8787", changeOrigin: true },
      "/mcp": { target: "http://127.0.0.1:8787", changeOrigin: true },
      "/health": { target: "http://127.0.0.1:8787", changeOrigin: true },
      "/connect": { target: "http://127.0.0.1:8787", changeOrigin: true },
    },
  },
  preview: { host: "127.0.0.1", port: 4611 },
});
