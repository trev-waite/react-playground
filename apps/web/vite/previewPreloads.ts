import type { Rolldown } from "vite";
import { slugFromPreviewPath } from "../src/lib/catalog.ts";

export function previewPreloads(bundle: Rolldown.OutputBundle, members: readonly { slug: string }[]): string[] {
  const chunks = Object.values(bundle).filter((file): file is Rolldown.OutputChunk => file.type === "chunk");
  const entry = chunks.find(chunk => chunk.isEntry);
  const seen = new Set(entry ? [entry.fileName, ...entry.imports] : []);
  const preloads: string[] = [];
  const visit = (fileName: string) => {
    const chunk = bundle[fileName];
    if (seen.has(fileName) || chunk?.type !== "chunk") return;
    seen.add(fileName);
    preloads.push(fileName);
    chunk.imports.forEach(visit);
  };
  const slugs = new Set(members.map(member => member.slug));
  for (const chunk of chunks) {
    const slug = slugFromPreviewPath(chunk.facadeModuleId ?? "");
    if (slug && slugs.has(slug)) visit(chunk.fileName);
  }
  return preloads;
}
