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

const failed = new WeakSet<Promise<SourceFile[]>>();

/**
 * Every file of every component on the card, fetched once. A failed fetch is
 * kept, so the sheet that renders it once more after it settles does not start
 * another; `loadSource` is what asks again.
 */
export function cardSource(card: SourceCard): Promise<SourceFile[]> {
  let files = sources.get(card.slug);
  if (!files) {
    const fetched = fetchSource(card.slug);
    fetched.catch(() => failed.add(fetched));
    sources.set(card.slug, fetched);
    files = fetched;
  }
  return files;
}

/** The card's files, fetched again if the last fetch failed. */
export function loadSource(card: SourceCard): Promise<SourceFile[]> {
  const files = sources.get(card.slug);
  if (files && failed.has(files)) sources.delete(card.slug);
  return cardSource(card);
}

/** Fetches the card's files and the highlighter before the sheet opens, so it opens on finished code. */
export function prepareCode(card: SourceCard): void {
  loadSource(card).catch(() => {});
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
