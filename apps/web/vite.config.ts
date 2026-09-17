import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { liveCatalogPlugin } from "./vite/liveCatalogPlugin.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, "");
  const proxy = {
    "/api": { target: env.API_PROXY_TARGET || "http://localhost:3001" },
  };
  return {
    plugins: [react(), liveCatalogPlugin()],
    resolve: {
      alias: {
        "@": path.join(root, "src"),
      },
    },
    server: {
      port: 3000,
      strictPort: true,
      proxy,
    },
    preview: {
      port: 3000,
      strictPort: true,
      proxy,
    },
  };
});
