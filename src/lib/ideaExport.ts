/**
 * Session bridge between the Experimental page and the active studio.
 * Studio harnesses (omit on export) register a draft; Save / Make Live read it.
 */

import type { IdeaDraft } from "./idea";

let exporter: (() => IdeaDraft) | null = null;

export function registerIdeaExporter(getDraft: (() => IdeaDraft) | null): void {
  exporter = getDraft;
}

export function getIdeaDraft(): IdeaDraft | null {
  try {
    return exporter?.() ?? null;
  } catch {
    return null;
  }
}

export function getIdeaSource(): string | null {
  const draft = getIdeaDraft();
  const source = draft?.source?.trim();
  return source ? source : null;
}
