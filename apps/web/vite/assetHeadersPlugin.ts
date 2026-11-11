import { appendFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";

/**
 * One immutable cache rule per hashed file. Not `/assets/*`: a missing file is
 * answered with the 404 page, and that rule would let browsers keep the 404 for
 * a year, even after a redeploy brings the file back.
 */
export function immutableAssetRules(fileNames: readonly string[]): string {
  return fileNames
    .filter(fileName => fileName.startsWith("assets/"))
    .sort()
    .map(fileName => `\n/${fileName}\n  Cache-Control: public, max-age=31536000, immutable\n`)
    .join("");
}

/** Appends `immutableAssetRules` for the build's assets to the `_headers` copied from public/. */
export function assetHeadersPlugin(): Plugin {
  return {
    name: "asset-headers",
    apply: "build",
    async writeBundle(options, bundle) {
      if (!options.dir) this.error("asset-headers: the build has no output directory");
      await appendFile(path.join(options.dir, "_headers"), immutableAssetRules(Object.keys(bundle)));
    },
  };
}
