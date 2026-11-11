import path from "node:path";
import { fileURLToPath } from "node:url";
import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { assetHeadersPlugin } from "./vite/assetHeadersPlugin.ts";
import { liveCatalogPlugin } from "./vite/liveCatalogPlugin.ts";
import { liveRoutesPlugin } from "./vite/liveRoutesPlugin.ts";
import { previewMetaPlugin } from "./vite/previewMetaPlugin.ts";
import { previewPreloadPlugin } from "./vite/previewPreloadPlugin.ts";
import { siteUrlPlugin } from "./vite/siteUrlPlugin.ts";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, "");
  return {
    plugins: [
      react(),
      // React Compiler: memoizes components and hooks at build time, so the code skips useMemo and useCallback.
      babel({ presets: [reactCompilerPreset()] }),
      liveCatalogPlugin(),
      previewMetaPlugin(),
      previewPreloadPlugin(),
      siteUrlPlugin(env),
      liveRoutesPlugin(),
      assetHeadersPlugin(),
    ],
    resolve: {
      alias: {
        "@": path.join(root, "src"),
      },
    },
    build: {
      // Cards draw their placeholders and previews from the first paint, so every style ships up front.
      cssCodeSplit: false,
      rolldownOptions: {
        output: {
          codeSplitting: {
            // React changes less often than the app, so it keeps its cache across deploys.
            groups: [
              {
                name: "vendor",
                test: /node_modules\/(react|react-dom|scheduler)\//,
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
        "/api": { target: env.API_PROXY_TARGET || "http://127.0.0.1:3001" },
      },
    },
    preview: {
      port: 3000,
      strictPort: true,
    },
  };
});
