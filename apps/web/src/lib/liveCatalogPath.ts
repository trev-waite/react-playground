export const LIVE_CATALOG_REFRESH = "live-catalog:refresh";
export const LIVE_CATALOG_READY = "live-catalog:ready";
export const LIVE_CATALOG_TIMEOUT_MS = 2500;

const LIVE_PREVIEW_RE = /\/src\/live\/(.+)\/preview\.tsx$/;

export function isPublishedLivePreview(file: string): boolean {
  const normalized = file.replace(/\\/g, "/");
  const slug = normalized.match(LIVE_PREVIEW_RE)?.[1];
  if (!slug) return false;
  return !slug.split("/").some(part => part.startsWith(".") || part.includes(".tmp"));
}
