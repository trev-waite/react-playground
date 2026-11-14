import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { cardFace, catalogEntries, folderFromFamilyPath, planCards, slugFromPreviewPath, type CardFace } from "../src/lib/catalog.ts";
import type { FamilyMeta, PreviewMeta } from "../src/lib/types.ts";
import { cardOrder } from "../src/live/order.ts";
import { previewMeta } from "./previewMetaPlugin.ts";

/** A card as the build knows it: its face, and the slugs of the components on it. */
export type BuildCard = CardFace & { members: { slug: string }[] };

/**
 * The Live catalog read from source, without running a component: the same
 * cards, in the same order, that the app plans from its module globs. The
 * build writes pages and link previews from it, and the deploy check holds the
 * build to it.
 */
export async function readLiveCards(liveDir: string): Promise<BuildCard[]> {
  const files = (await readdir(liveDir, { recursive: true }))
    .filter(file => !file.split(/[\\/]/).some(part => part.startsWith(".")))
    .map(file => path.join(liveDir, file).replace(/\\/g, "/"));
  const metas: Record<string, PreviewMeta | undefined> = {};
  const families: Record<string, FamilyMeta> = {};
  for (const file of files) {
    const folder = folderFromFamilyPath(file);
    if (!folder && !slugFromPreviewPath(file)) continue;
    const meta = previewMeta(await readFile(file, "utf8"), file);
    if (folder && meta) families[folder] = meta as FamilyMeta;
    else if (!folder) metas[file] = meta as PreviewMeta | undefined;
  }
  return planCards({ entries: catalogEntries(Object.keys(metas), metas), families, order: cardOrder }).map(plan => ({
    ...cardFace(plan),
    members: plan.entries.map(entry => ({ slug: entry.slug })),
  }));
}
