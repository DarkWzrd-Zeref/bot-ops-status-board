import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.BASE_PATH || "/",
  build: { target: "es2020" },
  server: { host: "127.0.0.1", port: 4611 },
  preview: { host: "127.0.0.1", port: 4611 },
});
