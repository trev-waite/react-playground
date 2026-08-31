import { describe, expect, test } from "bun:test";
import { canvasHasLayout, GPU_DPR_RANGE, isLayerRenderable, physicalCanvasSize } from "./host";

describe("physicalCanvasSize", () => {
  test("uses device pixel ratio up to the cap", () => {
    expect(physicalCanvasSize(100, 50, 2)).toEqual([200, 100]);
    expect(physicalCanvasSize(100, 50, 3)).toEqual([200, 100]);
    expect(physicalCanvasSize(100, 50, 1)).toEqual([100, 50]);
    expect(GPU_DPR_RANGE).toEqual([1, 2]);
  });

  test("never returns a zero axis", () => {
    expect(physicalCanvasSize(0, 0, 2)).toEqual([1, 1]);
  });
});

describe("canvasHasLayout", () => {
  test("rejects a canvas that has not been laid out", () => {
    expect(canvasHasLayout({ clientWidth: 0, clientHeight: 0 } as HTMLCanvasElement)).toBe(false);
    expect(canvasHasLayout({ clientWidth: 1, clientHeight: 800 } as HTMLCanvasElement)).toBe(false);
    expect(canvasHasLayout({ clientWidth: 320, clientHeight: 180 } as HTMLCanvasElement)).toBe(true);
  });
});

describe("isLayerRenderable", () => {
  test("treats a missing playground layer as standalone", () => {
    expect(isLayerRenderable(null)).toBe(true);
  });

  test("skips the stacked layer that is inert or aria-hidden", () => {
    expect(isLayerRenderable({ inert: true, ariaHidden: null })).toBe(false);
    expect(isLayerRenderable({ inert: false, ariaHidden: "true" })).toBe(false);
    expect(isLayerRenderable({ inert: false, ariaHidden: null })).toBe(true);
    expect(isLayerRenderable({ inert: false, ariaHidden: "false" })).toBe(true);
  });
});
