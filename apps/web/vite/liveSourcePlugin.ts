import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";
import type { SourceFile } from "../src/lib/types.ts";

const SOURCE_QUERY = "?source";
const LOCAL_IMPORT = /(?:\bfrom\s+|\bimport\s*\(?\s*)["'](\.\/[^"']+)["']/g;
const EXTENSIONS = ["", ".tsx", ".ts"];

/** The file a relative import names, if it is in the folder. */
function resolveLocal(folder: string, specifier: string): string | null {
  for (const extension of EXTENSIONS) {
    const file = path.join(folder, specifier + extension);
    if (path.dirname(file) === folder && existsSync(file) && !file.endsWith("/preview.tsx")) return file;
  }
  return null;
}

/**
 * A Live component as someone would copy it: `<Folder>.tsx` and every file in
 * its folder that it imports, directly or not. The preview that stages it,
 * its tests, and its staging styles stay out.
 */
export async function componentSources(folder: string): Promise<SourceFile[]> {
  const main = path.join(folder, `${path.basename(folder)}.tsx`);
  if (!existsSync(main)) return [];
  const files: string[] = [];
  const codes = new Map<string, string>();
  const visit = async (file: string) => {
    if (files.includes(file)) return;
    files.push(file);
    const code = await readFile(file, "utf8");
    codes.set(file, code);
    for (const [, specifier] of code.matchAll(LOCAL_IMPORT)) {
      const local = resolveLocal(folder, specifier!);
      if (local) await visit(local);
    }
  };
  await visit(main);
  const rank = (file: string) => (file === main ? 0 : file.endsWith(".css") ? 2 : 1);
  return files
    .toSorted((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .map(file => ({ name: path.basename(file), code: codes.get(file)! }));
}

/**
 * Serves `preview.tsx?source` as the component's source files, so a card can
 * show its code. Each card's source is its own chunk, fetched only when asked.
 */
export function liveSourcePlugin(): Plugin {
  return {
    name: "live-source",
    async load(id) {
      if (!id.endsWith(`/preview.tsx${SOURCE_QUERY}`)) return;
      const folder = path.dirname(id.slice(0, -SOURCE_QUERY.length));
      const files = await componentSources(folder);
      for (const file of files) this.addWatchFile(path.join(folder, file.name));
      return `export default ${JSON.stringify(files)};\n`;
    },
  };
}
