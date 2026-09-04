import { afterEach, describe, expect, mock, test } from "bun:test";

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void;

let observerCallback: ObserverCallback | null = null;
const stops: Array<ReturnType<typeof mock>> = [];

mock.module("vgpu", () => ({
  frameLoop: () => {
    const stop = mock(() => {});
    stops.push(stop);
    return { stop };
  },
}));

class FakeIntersectionObserver {
  constructor(callback: ObserverCallback) {
    observerCallback = callback;
  }
  observe() {}
  disconnect() {}
}

describe("pausableLoop", () => {
  afterEach(() => {
    observerCallback = null;
    stops.length = 0;
  });

  test("does not start a frame loop until the canvas intersects", async () => {
    globalThis.IntersectionObserver =
      FakeIntersectionObserver as unknown as typeof IntersectionObserver;
    const { pausableLoop } = await import("./pausableLoop");
    const loop = pausableLoop({} as never, {} as HTMLCanvasElement, () => {});
    expect(loop.running).toBe(false);
    expect(stops).toHaveLength(0);

    observerCallback?.([{ isIntersecting: true }]);
    expect(loop.running).toBe(true);
    expect(stops).toHaveLength(1);

    observerCallback?.([{ isIntersecting: false }]);
    expect(loop.running).toBe(false);
    expect(stops[0]).toHaveBeenCalledTimes(1);

    loop.stop();
  });
});
