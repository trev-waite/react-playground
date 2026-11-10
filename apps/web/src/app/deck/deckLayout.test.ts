import { describe, expect, test } from "bun:test";
import {
  anchoredScrollTop,
  CAMERA_MAX_SCALE,
  cameraPose,
  centeredScrollTop,
  GRID_GAP,
  GRID_TOP,
  gridAnchor,
  gridColumns,
  gridLayout,
  pageFrame,
  PAGE_INSET,
  type Rect,
} from "./deckLayout";

const desktop = { width: 1280, height: 800 };
const phone = { width: 390, height: 844 };

function cellOf(rect: Rect, cell: number) {
  return {
    column: Math.round((rect.x - 48) / (cell + GRID_GAP)),
    row: Math.round((rect.y - GRID_TOP) / (cell + GRID_GAP)),
  };
}

describe("gridLayout", () => {
  test("picks fewer columns as the viewport narrows", () => {
    expect(gridColumns(1184)).toBe(4);
    expect(gridColumns(704)).toBe(3);
    expect(gridColumns(358)).toBe(2);
  });

  test("packs mixed sizes densely, filling holes left by larger cards", () => {
    const { rects, height } = gridLayout(["tall", "wide", "tall", "wide"], desktop);
    const cell = (1184 - GRID_GAP * 3) / 4;
    expect(rects.map(rect => cellOf(rect, cell))).toEqual([
      { column: 0, row: 0 },
      { column: 1, row: 0 },
      { column: 3, row: 0 },
      { column: 1, row: 1 },
    ]);
    expect(rects[1]).toMatchObject({ width: cell * 2 + GRID_GAP, height: cell });
    expect(rects[0]).toMatchObject({ width: cell, height: cell * 2 + GRID_GAP });
    expect(height).toBeCloseTo(GRID_TOP + cell * 2 + GRID_GAP + 48);
  });

  test("clamps wide cards to the columns a phone has", () => {
    const { rects } = gridLayout(["large", "small"], phone);
    const width = phone.width - 32;
    expect(rects[0]?.width).toBeCloseTo(width);
    expect(rects[1]?.y).toBeGreaterThan(rects[0]!.y + rects[0]!.height);
  });

  test("keeps the grid clear of the notch and the home indicator", () => {
    const bare = gridLayout(["small", "small", "small"], phone);
    const inset = gridLayout(["small", "small", "small"], phone, { top: 59, right: 0, bottom: 34, left: 0 });
    expect(inset.rects.map(rect => rect.y)).toEqual(bare.rects.map(rect => rect.y + 59));
    expect(inset.height).toBe(bare.height + 59 + 34);
  });

  test("keeps a landscape grid clear of the side notch", () => {
    const landscape = { width: 844, height: 390 };
    const { rects } = gridLayout(["small", "small", "small"], landscape, { top: 0, right: 0, bottom: 21, left: 59 });
    expect(Math.min(...rects.map(rect => rect.x))).toBeGreaterThanOrEqual(59);
    expect(Math.max(...rects.map(rect => rect.x + rect.width))).toBeCloseTo(844 - 32);
  });

  test("is empty without cards", () => {
    expect(gridLayout([], desktop)).toEqual({ rects: [], height: 0 });
  });
});

describe("grid anchor", () => {
  const sizes = ["wide", "small", "small", "tall", "wide", "small", "large", "small"] as const;

  test("keeps the top card in place when the grid relayouts", () => {
    const narrow = gridLayout(sizes, phone);
    const wide = gridLayout(sizes, desktop);
    const top = 700;
    const anchor = gridAnchor(narrow.rects, top)!;
    const wideTop = anchoredScrollTop(wide.rects, anchor)!;
    expect(gridAnchor(wide.rects, wideTop)?.index).toBe(anchor.index);
    expect(anchoredScrollTop(narrow.rects, gridAnchor(wide.rects, wideTop)!)).toBeCloseTo(top);
  });

  test("anchors to the highest card still in view", () => {
    const { rects } = gridLayout(sizes, phone);
    const anchor = gridAnchor(rects, rects[1]!.y + 1)!;
    expect(rects[anchor.index]!.y + rects[anchor.index]!.height).toBeGreaterThan(rects[1]!.y + 1);
    expect(anchor.through).toBeGreaterThan(0);
    expect(gridAnchor(rects, 0)).toEqual({ index: 0, through: 0 });
  });
});

describe("pageFrame", () => {
  test("insets the page on every side", () => {
    expect(pageFrame(desktop)).toEqual({
      x: PAGE_INSET,
      y: PAGE_INSET,
      width: desktop.width - PAGE_INSET * 2,
      height: desktop.height - PAGE_INSET * 2,
    });
  });

  test("moves in from a side notch but may run under the status bar", () => {
    const landscape = { width: 844, height: 390 };
    expect(pageFrame(landscape, { top: 47, right: 0, bottom: 21, left: 59 })).toEqual({
      x: PAGE_INSET + 59,
      y: PAGE_INSET,
      width: 844 - PAGE_INSET * 2 - 59,
      height: 390 - PAGE_INSET * 2,
    });
  });
});

describe("centeredScrollTop", () => {
  const rect = { x: 0, y: 1000, width: 200, height: 200 };

  test("centers the card when the content allows it", () => {
    expect(centeredScrollTop(rect, desktop, 3000)).toBe(700);
  });

  test("clamps to the scrollable range", () => {
    expect(centeredScrollTop({ ...rect, y: 100 }, desktop, 3000)).toBe(0);
    expect(centeredScrollTop(rect, desktop, 1200)).toBe(400);
  });
});

describe("cameraPose", () => {
  const { rects } = gridLayout(["small", "small", "small", "small", "small", "small"], desktop);
  const frame = pageFrame(desktop);
  const focus = rects[1]!;

  function onScreen(rect: Rect, pose: ReturnType<typeof cameraPose>) {
    const width = rect.width * pose.scale;
    const height = rect.height * pose.scale;
    const left = rect.x + rect.width / 2 + pose.x - width / 2;
    const top = rect.y + rect.height / 2 + pose.y - height / 2;
    return { left, top, right: left + width, bottom: top + height };
  }

  test("centers the camera on the focused tile", () => {
    const pose = cameraPose(focus, focus, frame);
    const box = onScreen(focus, pose);
    expect((box.left + box.right) / 2).toBeCloseTo(frame.x + frame.width / 2);
    expect((box.top + box.bottom) / 2).toBeCloseTo(frame.y + frame.height / 2);
  });

  test("caps how large neighbors grow, to keep the first frame cheap to raster", () => {
    for (const rect of rects) {
      expect(cameraPose(rect, focus, frame).scale).toBeLessThanOrEqual(CAMERA_MAX_SCALE);
    }
  });

  test("pushes every other tile fully outside the viewport", () => {
    rects.forEach((rect, index) => {
      if (index === 1) return;
      const box = onScreen(rect, cameraPose(rect, focus, frame));
      const outside =
        box.right <= 0 ||
        box.left >= desktop.width ||
        box.bottom <= 0 ||
        box.top >= desktop.height;
      expect(outside).toBe(true);
    });
  });
});
