import { use, useDeferredValue, useSyncExternalStore } from "react";
import { cardFromPlan, planCards, type LiveCard, type LoadedPreview } from "./catalog";
import { liveCatalog } from "./discover";
import { requestCatalogRefresh } from "./devRefresh";
import { moduleStore } from "./moduleStore";
import type { LiveCatalog } from "./types";

const catalog = moduleStore(liveCatalog);

/** Keep loaders for unchanged slugs so their modules are not fetched again. */
function mergeCatalog(next: LiveCatalog, freshSlug?: string): LiveCatalog {
  const current = new Map(catalog.getSnapshot().entries.map(entry => [entry.slug, entry]));
  return {
    families: next.families,
    order: next.order,
    entries: next.entries.map(entry =>
      entry.slug === freshSlug ? entry : current.get(entry.slug) ?? entry,
    ),
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

const loadedCards = new WeakMap<LiveCatalog, Promise<LiveCard[]>>();

async function loadPreview(load: () => Promise<LoadedPreview>): Promise<LoadedPreview> {
  try {
    return await load();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not load preview" };
  }
}

function loadCards(snapshot: LiveCatalog): Promise<LiveCard[]> {
  let cards = loadedCards.get(snapshot);
  if (!cards) {
    // Every card is on stage at once in the grid, so resolve all previews up front.
    cards = Promise.all(
      planCards(snapshot).map(async plan =>
        cardFromPlan(plan, await Promise.all(plan.entries.map(entry => loadPreview(entry.load)))),
      ),
    );
    loadedCards.set(snapshot, cards);
  }
  return cards;
}

/**
 * Suspends until every Live preview module has loaded. Later catalog changes
 * keep showing the current cards until the new ones are ready.
 */
export function useLiveCards(): LiveCard[] {
  return use(loadCards(useDeferredValue(useLiveCatalog())));
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
