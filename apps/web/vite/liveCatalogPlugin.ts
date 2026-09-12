import path from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import {
  isPublishedLivePreview,
  LIVE_CATALOG_READY,
  LIVE_CATALOG_REFRESH,
} from "../src/lib/liveCatalogPath.ts";

function invalidateDiscover(server: ViteDevServer) {
  const file = path.resolve(server.config.root, "src/lib/discover.ts");

  // Vite 8 keeps a legacy graph and per-environment graphs.
  const legacy = server.moduleGraph.getModulesByFile(file);
  if (legacy) {
    for (const mod of legacy) {
      server.moduleGraph.invalidateModule(mod);
    }
  }

  for (const env of Object.values(server.environments)) {
    const mods = env.moduleGraph.getModulesByFile(file);
    if (!mods) continue;
    for (const mod of mods) {
      env.moduleGraph.invalidateModule(mod);
    }
  }
}

export function liveCatalogPlugin(): Plugin {
  return {
    name: "live-catalog",
    apply: "serve",
    configureServer(server) {
      server.watcher.add(path.join(server.config.root, "src/live"));

      server.ws.on(LIVE_CATALOG_REFRESH, () => {
        invalidateDiscover(server);
        server.ws.send({ type: "custom", event: LIVE_CATALOG_READY });
      });

      const onDiskChange = (file: string) => {
        if (!isPublishedLivePreview(file)) return;
        invalidateDiscover(server);
      };
      server.watcher.on("add", onDiskChange);
      server.watcher.on("unlink", onDiskChange);
    },
  };
}
