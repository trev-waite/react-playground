import { describe, expect, test } from "bun:test";
import { familyLayoutWidth, flightLayout, PREVIEW_MIN_SIZE, previewScale, restLayout } from "./fitPreview";

describe("previewScale", () => {
  test("keeps previews at full size on a page", () => {
    expect(previewScale(1200, 700)).toBe(1);
  });

  test("scales a small tile by its shorter side", () => {
    expect(previewScale(552, 252)).toBeCloseTo(252 / PREVIEW_MIN_SIZE);
  });

  test("never collapses to zero for an unlaid-out box", () => {
    expect(previewScale(0, 0)).toBeGreaterThan(0);
  });
});

describe("familyLayoutWidth", () => {
  test("lays a family out at the page's width when the tile has more room, as a wide phone tile does", () => {
    expect(familyLayoutWidth({ width: 326, height: 139 }, 310)).toBe(310);
  });

  test("lays a family out at the tile's width when the page has more room", () => {
    expect(familyLayoutWidth({ width: 520, height: 220 }, 1360)).toBeCloseTo(520 * (PREVIEW_MIN_SIZE / 220));
  });
});

describe("flightLayout", () => {
  const tileArea = { width: 256, height: 560 };
  const pageArea = { width: 1360, height: 672 };
  const tile = restLayout(tileArea);
  const page = restLayout(pageArea);

  test("lands on the layouts a preview rests at", () => {
    expect(flightLayout(tileArea, tile, page, 0)).toEqual(tile);
    expect(flightLayout(pageArea, tile, page, 1)).toEqual(page);
  });

  test("never lays out shorter than both ends, so content that gives way to a short stage keeps its shape", () => {
    // Mid-flight the stage is shorter than either end, as the page's padding morphs in.
    const area = { width: 330, height: 566 };
    const fitted = flightLayout(area, tile, page, 0.06);
    expect(fitted.height).toBeGreaterThanOrEqual(Math.min(tile.height, page.height));
    expect(restLayout(area).height).toBeLessThan(Math.min(tile.height, page.height));
  });

  test("scales the blended layout to fit the area it has", () => {
    const area = { width: 700, height: 600 };
    const fitted = flightLayout(area, tile, page, 0.5);
    expect(fitted.width * fitted.scale).toBeLessThanOrEqual(area.width + 1e-9);
    expect(fitted.height * fitted.scale).toBeLessThanOrEqual(area.height + 1e-9);
  });
});

type Entry = { target: unknown; contentRect: { width: number; height: number } };

describe("observeFit", () => {
  test("fits a batch with one layout read pass, not one per card", async () => {
    let notify: ((entries: Entry[]) => void) | null = null;
    globalThis.ResizeObserver = class {
      constructor(callback: (entries: Entry[]) => void) {
        notify = callback;
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    const { observeFit } = await import("./fitPreview");

    const log: string[] = [];
    // Records every style write and layout read in order, like the browser would see them.
    const preview = (name: string, natural: number) => {
      const content = {
        style: new Proxy({} as Record<string, string>, {
          set(target, key, value) {
            log.push("write");
            target[String(key)] = value;
            return true;
          },
        }),
        get clientWidth() {
          log.push("read");
          return parseFloat(content.style.width ?? "0");
        },
        get clientHeight() {
          log.push("read");
          return parseFloat(content.style.height ?? "0");
        },
        firstElementChild: {
          get scrollWidth() {
            log.push("read");
            return Math.max(natural, parseFloat(content.style.width ?? "0"));
          },
          get scrollHeight() {
            log.push("read");
            return parseFloat(content.style.height ?? "0");
          },
        },
      };
      const area = { name, clientWidth: 600, clientHeight: 600 };
      return { area, content };
    };

    const cards = [preview("a", 0), preview("b", 900), preview("c", 0)];
    for (const { area, content } of cards) {
      observeFit(area as unknown as HTMLElement, content as unknown as HTMLElement);
    }

    log.length = 0;
    notify!(cards.map(({ area }) => ({ target: area, contentRect: { width: 280, height: 280 } })));

    const pattern = log.map(entry => (entry === "write" ? "w" : "r")).join("");
    expect(pattern).toMatch(/^w+r+w*$/);
    // The overflowing preview shrinks further to fit its tile.
    expect(cards[1]!.content.style.transform).toBe(`scale(${(280 / 320) * (320 / 900)})`);
  });
});
