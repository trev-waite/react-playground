import { afterEach, describe, expect, mock, test } from "bun:test";

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void;

let observerCallback: ObserverCallback | null = null;
const stops: Array<ReturnType<typeof mock>> = [];
const callbacks: Array<(frame: unknown) => void> = [];

mock.module("vgpu", () => ({
  frameLoop: (_gpu: unknown, cb: (frame: unknown) => void) => {
    const stop = mock(() => {});
    stops.push(stop);
    callbacks.push(cb);
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
    callbacks.length = 0;
  });

  test("renders one frame off screen, then waits for the canvas to intersect", async () => {
    globalThis.IntersectionObserver =
      FakeIntersectionObserver as unknown as typeof IntersectionObserver;
    const { pausableLoop } = await import("./pausableLoop");
    const draw = mock(() => {});
    const loop = pausableLoop({} as never, {} as HTMLCanvasElement, draw);
    expect(loop.running).toBe(true);

    observerCallback?.([{ isIntersecting: false }]);
    expect(loop.running).toBe(true);

    callbacks[0]?.({});
    expect(draw).toHaveBeenCalledTimes(1);
    expect(loop.running).toBe(false);
    expect(stops[0]).toHaveBeenCalledTimes(1);

    observerCallback?.([{ isIntersecting: true }]);
    expect(loop.running).toBe(true);
    expect(stops).toHaveLength(2);

    observerCallback?.([{ isIntersecting: false }]);
    expect(loop.running).toBe(false);
    expect(stops[1]).toHaveBeenCalledTimes(1);

    loop.stop();
  });
});
