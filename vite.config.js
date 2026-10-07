import { defineConfig } from "vite";

export default defineConfig({
  publicDir: "public-assets",
  // Vite's built-in esbuild compiles JSX; no Babel plugin needed.
  esbuild: { jsx: "automatic" },
});
