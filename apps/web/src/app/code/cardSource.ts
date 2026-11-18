import { codePath } from "../../lib/liveRoutes";
import type { SourceFile } from "../../lib/types";
import { highlight, languageOf, warmHighlighter } from "./highlight";

type SourceCard = { slug: string };

const sources = new Map<string, Promise<SourceFile[]>>();
const tokens = new WeakMap<SourceFile, ReturnType<typeof highlight>>();

async function fetchSource(slug: string): Promise<SourceFile[]> {
  const response = await fetch(codePath(slug, "json"));
  if (!response.ok) throw new Error(`The code answered ${response.status}`);
  return (await response.json()) as SourceFile[];
}

/**
 * Every file of every component on the card, fetched once. A failed fetch is
 * kept until `forgetSource`: the sheet renders again once it settles, and a
 * fetch started anew each time would never let it show the failure.
 */
export function cardSource(card: SourceCard): Promise<SourceFile[]> {
  let files = sources.get(card.slug);
  if (!files) {
    files = fetchSource(card.slug);
    sources.set(card.slug, files);
  }
  return files;
}

/** Drops a card's fetch, so the next ask fetches again. */
export function forgetSource(card: SourceCard): void {
  sources.delete(card.slug);
}

/** Fetches the card's files and the highlighter before the sheet opens, so it opens on finished code. A failed early fetch is not kept. */
export function prepareCode(card: SourceCard): void {
  const files = cardSource(card);
  files.catch(() => {
    if (sources.get(card.slug) === files) forgetSource(card);
  });
  warmHighlighter();
}

/** The file's highlighted lines, worked out once per file. */
export function fileTokens(file: SourceFile): ReturnType<typeof highlight> {
  let lines = tokens.get(file);
  if (!lines) {
    lines = highlight(file.code, languageOf(file.name));
    lines.catch(() => tokens.delete(file));
    tokens.set(file, lines);
  }
  return lines;
}
