import type { Plugin, Rolldown } from "vite";
import { folderFromFamilyPath, slugFromPreviewPath } from "../src/lib/catalog.ts";

/**
 * Every path the Live app answers: each preview's slug and each family's folder.
 * Read from the bundle, so the list is exactly what ships.
 */
export function liveRoutes(bundle: Rolldown.OutputBundle): string[] {
  const routes = new Set<string>();
  for (const file of Object.values(bundle)) {
    if (file.type !== "chunk") continue;
    for (const id of file.moduleIds) {
      const route = slugFromPreviewPath(id) ?? folderFromFamilyPath(id);
      if (route) routes.add(route);
    }
  }
  return [...routes].sort();
}

/**
 * Writes the app's page at `<route>.html` for every route, so the Worker can
 * serve real pages and answer anything else with 404.html and a 404 status.
 */
export function liveRoutesPlugin(): Plugin {
  return {
    name: "live-routes",
    apply: "build",
    generateBundle: {
      order: "post",
      handler(_, bundle) {
        const page = bundle["index.html"];
        if (page?.type !== "asset") this.error("live-routes: the build emitted no index.html");
        for (const route of liveRoutes(bundle)) {
          this.emitFile({ type: "asset", fileName: `${route}.html`, source: page.source });
        }
      },
    },
  };
}
