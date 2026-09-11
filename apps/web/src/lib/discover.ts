import {
  buildTree as buildCatalogTree,
  catalogEntriesFromLoaders,
  livePreviewLoader as loaderForSlug,
} from "./catalog";
import type { PlaygroundEntry, PreviewModule, TreeNode } from "./types";

const previewLoaders = import.meta.glob<PreviewModule>("../live/**/preview.tsx");

export const liveEntries: PlaygroundEntry[] = catalogEntriesFromLoaders(previewLoaders);

export function livePreviewLoader(
  slug: string | null,
  entries: PlaygroundEntry[] = liveEntries,
): PlaygroundEntry["load"] | undefined {
  return loaderForSlug(slug, entries);
}

export function buildTree(entries: PlaygroundEntry[] = liveEntries): TreeNode[] {
  return buildCatalogTree(entries);
}
