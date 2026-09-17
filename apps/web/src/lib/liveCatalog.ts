import { useSyncExternalStore } from "react";
import { liveEntries } from "./discover";
import { requestCatalogRefresh } from "./devRefresh";
import { moduleStore } from "./moduleStore";

const catalog = moduleStore(liveEntries);

if (import.meta.hot) {
  import.meta.hot.accept("./discover", next => {
    if (next) {
      const entries: typeof liveEntries = next.liveEntries;
      const current = new Map(catalog.getSnapshot().map(entry => [entry.slug, entry]));
      catalog.update(entries.map(entry => current.get(entry.slug) ?? entry));
    }
  });
}

export function useLiveEntries() {
  return useSyncExternalStore(catalog.subscribe, catalog.getSnapshot);
}

export async function refreshLiveCatalog(slug?: string): Promise<void> {
  const timestamp = await requestCatalogRefresh(import.meta.hot, slug);
  const next: typeof import("./discover") = await import(
    /* @vite-ignore */ `/src/lib/discover.ts?t=${timestamp}`
  );
  if (slug) {
    const entry = next.liveEntries.find(entry => entry.slug === slug);
    if (!entry) throw new Error("Published files are not yet in the Live catalog. Try again.");
    await entry.load();
  }
  const current = new Map(catalog.getSnapshot().map(entry => [entry.slug, entry]));
  catalog.update(next.liveEntries.map(entry =>
    entry.slug === slug ? entry : current.get(entry.slug) ?? entry,
  ));
}
