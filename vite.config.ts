import { defineConfig } from "vite";

// BASE_PATH lets the same build serve from "/" (Railway/nginx) or "/<repo>/" (GitHub Pages).
export default defineConfig({
  base: process.env.BASE_PATH || "/",
  build: { target: "es2020" },
});
