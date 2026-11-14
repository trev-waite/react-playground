import { tokenize, type CodeLanguage, type Run } from "./tokenize";

export type HighlightRequest = { id: number; code: string; language: CodeLanguage };
export type HighlightResult = { id: number; lines: Run[][] } | { id: number; error: string };

/** Highlights off the main thread: compiling a grammar's patterns would otherwise freeze the sheet for a long moment. */
self.onmessage = async ({ data }: MessageEvent<HighlightRequest>) => {
  try {
    const result: HighlightResult = { id: data.id, lines: await tokenize(data.code, data.language) };
    self.postMessage(result);
  } catch (error) {
    const result: HighlightResult = { id: data.id, error: error instanceof Error ? error.message : "Highlighting failed" };
    self.postMessage(result);
  }
};
