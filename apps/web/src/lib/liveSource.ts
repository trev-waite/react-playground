import { slugFromPreviewPath } from "./catalog";
import type { SourceFile } from "./types";

// Served by liveSourcePlugin: each component's own files, one chunk per component.
const loaders = import.meta.glob<SourceFile[]>("../live/**/preview.tsx", { query: "?source", import: "default" });

const bySlug = new Map(
  Object.entries(loaders).flatMap(([filePath, load]) => {
    const slug = slugFromPreviewPath(filePath);
    return slug ? [[slug, load] as const] : [];
  }),
);

/** The component's source files, fetched on first ask. */
export function loadSource(slug: string): Promise<SourceFile[]> {
  return bySlug.get(slug)?.() ?? Promise.resolve([]);
}
