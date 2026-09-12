import { describe, expect, test } from "bun:test";
import {
  isPublishedLivePreview,
  LIVE_CATALOG_READY,
  LIVE_CATALOG_REFRESH,
  waitForLiveCatalogReady,
  type LiveCatalogHot,
} from "./liveCatalog";

describe("isPublishedLivePreview", () => {
  test("accepts a published Live preview path", () => {
    expect(
      isPublishedLivePreview(
        "/apps/web/src/live/buttons/PrimaryButton/preview.tsx",
      ),
    ).toBe(true);
    expect(
      isPublishedLivePreview(
        "C:\\apps\\web\\src\\live\\shaders\\LightDispersion\\preview.tsx",
      ),
    ).toBe(true);
  });

  test("rejects staging dirs, other files, and non-Live paths", () => {
    expect(
      isPublishedLivePreview(
        "/apps/web/src/live/buttons/.PrimaryButton.abc.tmp/preview.tsx",
      ),
    ).toBe(false);
    expect(
      isPublishedLivePreview(
        "/apps/web/src/live/buttons/PrimaryButton/PrimaryButton.tsx",
      ),
    ).toBe(false);
    expect(
      isPublishedLivePreview(
        "/apps/web/src/experimental/ideas/Study/source.tsx",
      ),
    ).toBe(false);
  });
});

describe("waitForLiveCatalogReady", () => {
  test("resolves immediately without a Vite hot client", async () => {
    await waitForLiveCatalogReady(undefined);
  });

  test("sends refresh and resolves when Vite acks ready", async () => {
    const listeners = new Map<string, () => void>();
    const sent: string[] = [];
    const hot: LiveCatalogHot = {
      send(event) {
        sent.push(event);
        if (event === LIVE_CATALOG_REFRESH) {
          listeners.get(LIVE_CATALOG_READY)?.();
        }
      },
      on(event, cb) {
        listeners.set(event, cb);
      },
      off(event, cb) {
        if (listeners.get(event) === cb) listeners.delete(event);
      },
    };

    await waitForLiveCatalogReady(hot, 1000);
    expect(sent).toEqual([LIVE_CATALOG_REFRESH]);
    expect(listeners.size).toBe(0);
  });

  test("resolves after timeout when Vite never acks", async () => {
    const hot: LiveCatalogHot = {
      send() {},
      on() {},
      off() {},
    };
    await waitForLiveCatalogReady(hot, 15);
  });
});
