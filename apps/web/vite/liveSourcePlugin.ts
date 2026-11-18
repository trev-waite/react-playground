import path from "node:path";
import type { Plugin } from "vite";
import { codePath } from "../src/lib/liveRoutes.ts";
import { codeMarkdown, type CodeCard } from "./codeMarkdown.ts";
import { readLiveCards } from "./liveCards.ts";
import { resolveSiteUrl } from "./liveRoutesPlugin.ts";
import { oneFileSources } from "./oneFile.ts";

/** Every card, or just the one `slug` names, with each component as one file to copy, read from source. */
export async function readCodeCards(liveDir: string, slug?: string): Promise<CodeCard[]> {
  const cards = (await readLiveCards(liveDir)).filter(card => slug === undefined || card.slug === slug);
  return Promise.all(
    cards.map(async card => ({
      slug: card.slug,
      title: card.title,
      description: card.description,
      members: await Promise.all(
        card.members.map(async member => ({ ...member, files: await oneFileSources(path.join(liveDir, member.slug), liveDir) })),
      ),
    })),
  );
}

/** A card's published code: the files for the code sheet, and the Markdown a person or an agent downloads. */
export function codeFiles(cards: readonly CodeCard[], siteUrl: string | null): Map<string, string> {
  const files = new Map<string, string>();
  for (const card of cards) {
    files.set(codePath(card.slug, "json"), JSON.stringify(card.members.flatMap(member => member.files)));
    files.set(codePath(card.slug, "md"), codeMarkdown(card, siteUrl));
  }
  return files;
}

const CONTENT_TYPES = { json: "application/json", md: "text/markdown" } as const;

/**
 * Publishes each card's code at `codePath`: written into the build, and served
 * fresh by the dev server. Plain files, not chunks, so a failed fetch can be
 * tried again: a browser keeps a failed module import for the page's life.
 */
export function liveSourcePlugin(env: Record<string, string | undefined>): Plugin {
  const siteUrl = resolveSiteUrl(env);
  let liveDir = "";
  return {
    name: "live-source",
    configResolved(config) {
      liveDir = path.join(config.root, "src/live");
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
        const [, slug, format] = pathname.match(/^\/code\/(.+)\.(json|md)$/) ?? [];
        if (!slug || (format !== "json" && format !== "md")) return next();
        readCodeCards(liveDir, slug).then(
          cards => {
            const body = codeFiles(cards, siteUrl).get(pathname);
            response.statusCode = body === undefined ? 404 : 200;
            response.setHeader("Content-Type", body === undefined ? "text/plain; charset=utf-8" : `${CONTENT_TYPES[format]}; charset=utf-8`);
            // Served fresh from source each time, so a browser must not keep an older one.
            response.setHeader("Cache-Control", "no-store");
            response.end(body ?? "Not found");
          },
          error => next(error),
        );
      });
    },
    async generateBundle() {
      for (const [file, source] of codeFiles(await readCodeCards(liveDir), siteUrl)) {
        this.emitFile({ type: "asset", fileName: file.slice(1), source });
      }
    },
  };
}
