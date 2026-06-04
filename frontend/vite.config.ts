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
      "/api": "http://127.0.0.1:5000",
      "/jobs": "http://127.0.0.1:5000",
      "/scan": "http://127.0.0.1:5000",
      "/floor": "http://127.0.0.1:5000",
    },
  },
  build: {
    outDir: "../static/dist",
    emptyOutDir: true,
  },
});
