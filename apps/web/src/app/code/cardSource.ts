import { loadSource } from "../../lib/liveSource";
import type { SourceFile } from "../../lib/types";
import { highlight, languageOf, loadHighlighter } from "./highlight";

type SourceCard = { slug: string; members: readonly { slug: string }[] };

const sources = new Map<string, Promise<SourceFile[]>>();
const tokens = new WeakMap<SourceFile, ReturnType<typeof highlight>>();

/** Every file of every component on the card, fetched once. A failed fetch is forgotten, so the next ask tries again. */
export function cardSource(card: SourceCard): Promise<SourceFile[]> {
  let files = sources.get(card.slug);
  if (!files) {
    files = Promise.all(card.members.map(member => loadSource(member.slug))).then(lists => lists.flat());
    files.catch(() => sources.delete(card.slug));
    sources.set(card.slug, files);
  }
  return files;
}

/** Fetches the card's files and the highlighter before the sheet opens, so it opens on finished code. */
export function prepareCode(card: SourceCard): void {
  cardSource(card).catch(() => {});
  loadHighlighter().catch(() => {});
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
