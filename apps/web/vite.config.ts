import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { liveCatalogPlugin } from "./vite/liveCatalogPlugin.ts";
import { previewPreloadPlugin } from "./vite/previewPreloadPlugin.ts";
import { siteUrlPlugin } from "./vite/siteUrlPlugin.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, "");
  return {
    plugins: [react(), liveCatalogPlugin(), previewPreloadPlugin(), siteUrlPlugin(env)],
    resolve: {
      alias: {
        "@": path.join(root, "src"),
      },
    },
    build: {
      // Every preview's styles are needed for the first paint of the deck.
      cssCodeSplit: false,
      rolldownOptions: {
        output: {
          codeSplitting: {
            // Libraries change less often than the app, so they keep their cache across deploys.
            groups: [
              {
                name: "vendor",
                test: /node_modules\/(react|react-dom|scheduler|motion|framer-motion|motion-dom|motion-utils)\//,
              },
            ],
          },
        },
      },
    },
    server: {
      port: 3000,
      strictPort: true,
      proxy: {
        "/api": { target: env.API_PROXY_TARGET || "http://localhost:3001" },
      },
    },
    preview: {
      port: 3000,
      strictPort: true,
    },
  };
});
