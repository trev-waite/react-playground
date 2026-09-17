import path from "node:path";
import { normalizePath, type EnvironmentModuleNode, type Plugin } from "vite";
import { IDEAS_CHANGED, LIVE_CATALOG_READY, LIVE_CATALOG_REFRESH } from "../src/lib/liveCatalogPath.ts";
import type { CatalogRequest } from "../src/lib/devRefresh.ts";

export function liveCatalogPlugin(): Plugin {
  return {
    name: "live-catalog",
    apply: "serve",
    configureServer(server) {
      const environment = server.environments.client;
      const discover = path.resolve(server.config.root, "src/lib/discover.ts");
      const ideasRoot = normalizePath(path.resolve(server.config.root, "src/experimental/ideas"));
      let timestamp = 0;
      let ideasTimer: ReturnType<typeof setTimeout> | undefined;

      server.ws.on(LIVE_CATALOG_REFRESH, async (request: CatalogRequest, client) => {
        if (!request || typeof request.requestId !== "string") return;
        const { requestId, slug } = request;
        try {
          if (slug != null && (typeof slug !== "string" || !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)+$/.test(slug))) {
            throw new Error("Invalid Live component path.");
          }
          timestamp = Math.max(Date.now(), timestamp + 1);
          const revision = timestamp;
          const files = [discover];
          if (slug) {
            const directory = path.resolve(server.config.root, "src/live", slug);
            files.push(path.join(directory, "preview.tsx"), path.join(directory, `${path.basename(slug)}.tsx`));
          }
          // Publish may finish before the filesystem watcher fires. Stamp the
          // affected modules so fresh imports also bypass the browser's cache.
          const seen = new Set<EnvironmentModuleNode>();
          for (const file of files) {
            for (const module of environment.moduleGraph.getModulesByFile(normalizePath(file)) ?? []) {
              environment.moduleGraph.invalidateModule(module, seen, revision, true);
            }
          }
          await environment.transformRequest(`/src/lib/discover.ts?t=${revision}`);
          client.send({ type: "custom", event: LIVE_CATALOG_READY, data: { requestId, timestamp: revision } });
        } catch (error) {
          client.send({
            type: "custom", event: LIVE_CATALOG_READY,
            data: { requestId, error: error instanceof Error ? error.message : "Catalog refresh failed." },
          });
        }
      });

      const onIdeaChange = (file: string) => {
        const relative = normalizePath(file).slice(ideasRoot.length + 1);
        if (!normalizePath(file).startsWith(`${ideasRoot}/`) || !/^[A-Za-z][A-Za-z0-9]*\/(source\.tsx|project\.json)$/.test(relative)) return;
        clearTimeout(ideasTimer);
        ideasTimer = setTimeout(() => {
          server.ws.send({ type: "custom", event: IDEAS_CHANGED });
        }, 80);
      };
      server.watcher.on("add", onIdeaChange);
      server.watcher.on("change", onIdeaChange);
      server.watcher.on("unlink", onIdeaChange);
      server.httpServer?.once("close", () => {
        clearTimeout(ideasTimer);
        server.watcher.off("add", onIdeaChange);
        server.watcher.off("change", onIdeaChange);
        server.watcher.off("unlink", onIdeaChange);
      });
    },
  };
}
