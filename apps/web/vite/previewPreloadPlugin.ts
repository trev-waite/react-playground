import type { Plugin, Rolldown } from "vite";

const PREVIEW = /\/live\/.+\/preview\.tsx$/;

/**
 * Chunks to fetch alongside the entry: every Live preview and what it imports,
 * minus what the entry already loads. Lazy imports inside a preview stay lazy.
 */
export function previewPreloads(bundle: Rolldown.OutputBundle): string[] {
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
  for (const chunk of chunks) {
    if (chunk.facadeModuleId && PREVIEW.test(chunk.facadeModuleId)) visit(chunk.fileName);
  }
  // Same-priority scripts arrive in request order, so light cards fill in before heavy ones.
  const size = (fileName: string) => (bundle[fileName] as Rolldown.OutputChunk).code.length;
  return preloads.sort((a, b) => size(a) - size(b));
}

/**
 * Each card loads its own preview, and the entry only asks for them after it
 * runs. Preloading them from the HTML starts every download at once, at low
 * priority so the app shell and styles still arrive first.
 */
export function previewPreloadPlugin(): Plugin {
  let base = "/";
  return {
    name: "preview-preload",
    apply: "build",
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: "post",
      handler(_html, { bundle }) {
        if (!bundle) return;
        return previewPreloads(bundle).map(fileName => ({
          tag: "link",
          attrs: { rel: "modulepreload", crossorigin: true, fetchpriority: "low", href: `${base}${fileName}` },
          injectTo: "head",
        }));
      },
    },
  };
}
