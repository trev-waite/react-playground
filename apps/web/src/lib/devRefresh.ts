import { LIVE_CATALOG_READY, LIVE_CATALOG_REFRESH, LIVE_CATALOG_TIMEOUT_MS } from "./liveCatalogPath";

export type CatalogRequest = { requestId: string; slug?: string };
export type CatalogResponse = { requestId: string; timestamp?: number; error?: string };
export type LiveCatalogHot = {
  send: (event: string, data: CatalogRequest) => void;
  on: (event: string, cb: (response: CatalogResponse) => void) => void;
  off: (event: string, cb: (response: CatalogResponse) => void) => void;
};

export function requestCatalogRefresh(
  hot: LiveCatalogHot | undefined,
  slug?: string,
  timeoutMs = LIVE_CATALOG_TIMEOUT_MS,
): Promise<number> {
  if (!hot) return Promise.reject(new Error("Live refresh requires the development server."));
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const cleanup = () => {
      clearTimeout(timer);
      hot.off(LIVE_CATALOG_READY, onReady);
    };
    const onReady = (response: CatalogResponse) => {
      if (response.requestId !== requestId) return;
      cleanup();
      if (response.error || response.timestamp == null) {
        reject(new Error(response.error ?? "Could not refresh the Live catalog."));
      } else resolve(response.timestamp);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Live refresh timed out. Check the dev server and try again."));
    }, timeoutMs);
    hot.on(LIVE_CATALOG_READY, onReady);
    try {
      hot.send(LIVE_CATALOG_REFRESH, { requestId, slug });
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
