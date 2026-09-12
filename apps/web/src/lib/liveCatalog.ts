import {
  LIVE_CATALOG_READY,
  LIVE_CATALOG_REFRESH,
  LIVE_CATALOG_TIMEOUT_MS,
} from "./liveCatalogPath";

export {
  isPublishedLivePreview,
  LIVE_CATALOG_READY,
  LIVE_CATALOG_REFRESH,
  LIVE_CATALOG_TIMEOUT_MS,
} from "./liveCatalogPath";

export type LiveCatalogHot = {
  send: (event: string, data?: unknown) => void;
  on: (event: string, cb: () => void) => void;
  off: (event: string, cb: () => void) => void;
};

export function waitForLiveCatalogReady(
  hot: LiveCatalogHot | undefined | null,
  timeoutMs = LIVE_CATALOG_TIMEOUT_MS,
): Promise<void> {
  if (!hot) return Promise.resolve();

  return new Promise(resolve => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      hot.off(LIVE_CATALOG_READY, finish);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    hot.on(LIVE_CATALOG_READY, finish);
    hot.send(LIVE_CATALOG_REFRESH);
  });
}

export async function reloadLiveCatalog(): Promise<void> {
  await waitForLiveCatalogReady(import.meta.hot);
  window.location.reload();
}
