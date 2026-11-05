import { describe, expect, test } from "bun:test";
import { PREVIEW_MIN_SIZE, previewScale } from "./fitPreview";

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
