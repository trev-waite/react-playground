import { useMemo, useSyncExternalStore } from "react";
import { cardFromPlan, planCards, type LiveCard } from "./catalog";
import { liveCatalog } from "./discover";
import { requestCatalogRefresh } from "./devRefresh";
import { moduleStore } from "./moduleStore";
import type { LiveCatalog, PlaygroundEntry, PreviewModule } from "./types";

const catalog = moduleStore(liveCatalog);

/** Keep loaders for unchanged slugs so their modules are not fetched again. */
function mergeCatalog(next: LiveCatalog, freshSlug?: string): LiveCatalog {
  const current = new Map(catalog.getSnapshot().entries.map(entry => [entry.slug, entry]));
  return {
    families: next.families,
    order: next.order,
    entries: next.entries.map(entry => {
      const kept = entry.slug === freshSlug ? undefined : current.get(entry.slug);
      return kept ? { ...entry, load: kept.load } : entry;
    }),
  };
}

if (import.meta.hot) {
  import.meta.hot.accept("./discover", next => {
    if (!next) return;
    const nextCatalog: LiveCatalog = next.liveCatalog;
    catalog.update(mergeCatalog(nextCatalog));
  });
}

export function useLiveCatalog(): LiveCatalog {
  return useSyncExternalStore(catalog.subscribe, catalog.getSnapshot);
}

export function useLiveEntries() {
  return useLiveCatalog().entries;
}

type TrackedPromise<T> = Promise<T> & { status?: "pending" | "fulfilled" | "rejected"; value?: T; reason?: unknown };

const modules = new WeakMap<PlaygroundEntry["load"], Promise<PreviewModule>>();

/**
 * One promise per loader, started once. It records how it settled in the
 * fields React's `use` reads, so a module that is already here renders
 * without a loading frame.
 */
function moduleFor(entry: PlaygroundEntry): Promise<PreviewModule> {
  let module = modules.get(entry.load);
  if (!module) {
    const tracked: TrackedPromise<PreviewModule> = entry.load();
    tracked.status = "pending";
    tracked.then(
      value => {
        tracked.status = "fulfilled";
        tracked.value = value;
      },
      reason => {
        tracked.status = "rejected";
        tracked.reason = reason;
      },
    );
    module = tracked;
    modules.set(entry.load, module);
  }
  return module;
}

/** Every card, straight away. Each preview loads on its own inside its card. */
export function useLiveCards(): LiveCard[] {
  const snapshot = useLiveCatalog();
  return useMemo(() => planCards(snapshot).map(plan => cardFromPlan(plan, moduleFor)), [snapshot]);
}

export async function refreshLiveCatalog(slug?: string): Promise<void> {
  const timestamp = await requestCatalogRefresh(import.meta.hot, slug);
  const next: typeof import("./discover") = await import(
    /* @vite-ignore */ `/src/lib/discover.ts?t=${timestamp}`
  );
  if (slug) {
    const entry = next.liveCatalog.entries.find(entry => entry.slug === slug);
    if (!entry) throw new Error("Published files are not yet in the Live catalog. Try again.");
    await entry.load();
  }
  catalog.update(mergeCatalog(next.liveCatalog, slug));
}
