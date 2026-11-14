import type { HighlightRequest, HighlightResult } from "./highlightWorker";
import type { CodeLanguage, Run } from "./tokenize";

type Pending = { resolve: (lines: Run[][]) => void; reject: (error: Error) => void };

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, Pending>();

/** The highlighting worker, started on first use. If it dies, every waiting file falls back to plain text and the next ask starts a new one. */
function highlighter(): Worker {
  if (worker) return worker;
  const started = new Worker(new URL("./highlightWorker.ts", import.meta.url), { type: "module" });
  started.onmessage = ({ data }: MessageEvent<HighlightResult>) => {
    const waiting = pending.get(data.id);
    pending.delete(data.id);
    if ("lines" in data) waiting?.resolve(data.lines);
    else waiting?.reject(new Error(data.error));
  };
  started.onerror = () => {
    worker = null;
    started.terminate();
    for (const waiting of pending.values()) waiting.reject(new Error("The highlighter stopped"));
    pending.clear();
  };
  worker = started;
  return started;
}

export function languageOf(fileName: string): CodeLanguage {
  return fileName.endsWith(".css") ? "css" : "tsx";
}

/** The file's lines as colored runs, worked out in the highlighting worker. */
export function highlight(code: string, language: CodeLanguage): Promise<Run[][]> {
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    const request: HighlightRequest = { id, code, language };
    highlighter().postMessage(request);
  });
}

let warmed = false;

/** Starts the worker and compiles both grammars ahead of a press, so the sheet opens on colored code sooner. */
export function warmHighlighter(): void {
  if (warmed) return;
  warmed = true;
  highlight("export const a = <b className={c}>d</b>;", "tsx").catch(() => {});
  highlight(".a { color: red; }", "css").catch(() => {});
}
