import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { MotionValue, type Animation } from "../motion/motionValue";
import type { Size } from "./deckLayout";
import {
  familyLayoutWidth,
  FLIGHT_STEP,
  flightLayout,
  flightStops,
  heldLayout,
  stopAt,
  PREVIEW_MIN_SIZE,
  previewScale,
  restLayout,
} from "./fitPreview";

describe("stepping a layout in flight", () => {
  const change = (a: number, b: number) => Math.max(a / b, b / a);
  const sizeAt = (tile: Size, page: Size, stop: number) => ({
    width: tile.width * (1 - stop) + page.width * stop,
    height: tile.height * (1 - stop) + page.height * stop,
  });
  /** How much each side changes over each step, as [width, height] ratios. */
  const steps = (tile: Size, page: Size) => {
    const stops = flightStops(tile, page);
    return stops.slice(1).map((stop, index) => {
      const from = sizeAt(tile, page, stops[index]!);
      const to = sizeAt(tile, page, stop);
      return [change(from.width, to.width), change(from.height, to.height)] as const;
    });
  };
  const shapes: [name: string, tile: Size, page: Size][] = [
    ["a small tile growing into a desktop page", { width: 320, height: 320 }, { width: 1360, height: 672 }],
    ["a wide tile growing into a desktop page", { width: 700, height: 320 }, { width: 1360, height: 672 }],
    ["a wide phone tile narrowing as it grows taller", { width: 745.931, height: 320 }, { width: 322, height: 626.4 }],
    ["a tall tile widening as it grows shorter", { width: 320, height: 745.931 }, { width: 1360, height: 652 }],
    ["a small phone tile growing a little taller, with one stop between", { width: 320, height: 320 }, { width: 320, height: 413 }],
    ["a tile growing by two fifths, with one stop between", { width: 320, height: 320 }, { width: 448, height: 448 }],
    ["a tile growing by two thirds, with two stops between", { width: 320, height: 320 }, { width: 320, height: 540 }],
  ];
  /** The stops a flight lays out at, in the order it takes them, sweeping its progress finely from one end to the other. */
  const taken = (tile: Size, page: Size, to: 0 | 1) => {
    const stops = flightStops(tile, page);
    const sequence: number[] = [];
    for (let frame = 0; frame <= 2000; frame++) {
      const progress = to === 1 ? frame / 2000 : 1 - frame / 2000;
      const stop = stopAt(stops, progress);
      if (sequence.at(-1) !== stop) sequence.push(stop);
    }
    return { stops, sequence };
  };

  test("starts and ends on the rest layouts, with a handful of stops between rather than one per frame", () => {
    for (const [, tile, page] of shapes) {
      const stops = flightStops(tile, page);
      expect(stops[0]).toBe(0);
      expect(stops.at(-1)).toBe(1);
      expect(stops.length).toBeGreaterThan(2);
      expect(stops.length).toBeLessThan(12);
      stops.slice(1).forEach((stop, index) => expect(stop).toBeGreaterThan(stops[index]!));
    }
  });

  test("never changes either side by more than a step, whichever way each side is going", () => {
    for (const [name, tile, page] of shapes) {
      for (const [from, to] of [[tile, page], [page, tile]] as const) {
        for (const [width, height] of steps(from, to)) {
          expect(`${name}: ${Math.max(width, height) <= FLIGHT_STEP + 1e-9}`).toBe(`${name}: true`);
        }
      }
    }
  });

  test("spaces the stops evenly for the side that changes most", () => {
    const widths = steps({ width: 320, height: 320 }, { width: 1360, height: 672 }).map(([width]) => width);
    for (const width of widths) expect(width).toBeCloseTo(widths[0]!, 9);
    expect(widths.length).toBe(Math.ceil(Math.log(1360 / 320) / Math.log(FLIGHT_STEP)));
  });

  test("goes straight from one rest layout to the other when they are within a step", () => {
    expect(flightStops({ width: 320, height: 320 }, { width: 322, height: 380 })).toEqual([0, 1]);
    expect(flightStops({ width: 320, height: 320 }, { width: 320, height: 320 })).toEqual([0, 1]);
  });

  test("takes every stop in turn, opening and closing, so the layouts a flight actually goes through are never more than a step apart", () => {
    for (const [name, tile, page] of shapes) {
      for (const to of [0, 1] as const) {
        const { stops, sequence } = taken(tile, page, to);
        expect(`${name}: ${sequence.join()}`).toBe(`${name}: ${(to === 1 ? stops : stops.toReversed()).join()}`);
        sequence.slice(1).forEach((stop, index) => {
          const from = sizeAt(tile, page, sequence[index]!);
          const next = sizeAt(tile, page, stop);
          const most = Math.max(change(from.width, next.width), change(from.height, next.height));
          expect(`${name}: ${most <= FLIGHT_STEP + 1e-9}`).toBe(`${name}: true`);
        });
      }
    }
  });

  test("lays out at whichever stop the card is nearest, and at an end once past it", () => {
    const stops = [0, 0.2, 0.4, 0.7, 1];
    expect(stopAt(stops, 0.29)).toBe(0.2);
    expect(stopAt(stops, 0.31)).toBe(0.4);
    expect(stopAt(stops, 0.6)).toBe(0.7);
    expect(stopAt(stops, 1.04)).toBe(1);
    expect(stopAt(stops, -0.02)).toBe(0);
  });

  test("keeps an end's own layout in place within a step of it, so the last relayout comes while the card is still well short of rest", () => {
    const stops = [0, 0.2, 0.4, 0.7, 1];
    expect(stopAt(stops, 0.19)).toBe(0);
    expect(stopAt(stops, 0.2)).toBe(0);
    expect(stopAt(stops, 0.21)).toBe(0.2);
    expect(stopAt(stops, 0.69)).toBe(0.7);
    expect(stopAt(stops, 0.7)).toBe(1);
    expect(stopAt(stops, 0.9)).toBe(1);
  });

  test("with one stop between the ends or none, takes whichever is nearest: its steps are long, so it changes well short of either end", () => {
    expect(stopAt([0, 1], 0.49)).toBe(0);
    expect(stopAt([0, 1], 0.51)).toBe(1);
    const stops = [0, 0.45, 1];
    expect(stopAt(stops, 0.2)).toBe(0);
    expect(stopAt(stops, 0.3)).toBe(0.45);
    expect(stopAt(stops, 0.7)).toBe(0.45);
    expect(stopAt(stops, 0.8)).toBe(1);
  });

  test("scales a held layout to fit its area without stretching it", () => {
    expect(heldLayout({ width: 400, height: 200 }, { width: 200, height: 200 })).toEqual({ width: 400, height: 200, scale: 0.5 });
    expect(heldLayout({ width: 400, height: 200 }, { width: 800, height: 200 })).toEqual({ width: 400, height: 200, scale: 1 });
  });
});

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

  test("lands on them exactly, whatever their sizes, so arriving lays nothing out again", () => {
    const wide = { width: 745.931, height: 320 };
    const narrow = { width: 322, height: 626.4 };
    expect(flightLayout({ width: 300, height: 300 }, wide, narrow, 0)).toMatchObject(wide);
    expect(flightLayout({ width: 300, height: 300 }, wide, narrow, 1)).toMatchObject(narrow);
    expect(flightLayout({ width: 300, height: 300 }, wide, narrow, 1.03)).toMatchObject(narrow);
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
  // A moved card asks the shared frame loop for a frame. They are held here and run at the end, so the loop is left idle.
  let frames: FrameRequestCallback[] = [];
  const realFrame = globalThis.requestAnimationFrame;
  beforeAll(() => {
    globalThis.requestAnimationFrame = callback => frames.push(callback);
  });
  afterAll(() => {
    while (frames.length > 0) frames.shift()!(performance.now());
    frames = [];
    globalThis.requestAnimationFrame = realFrame;
  });

  // Every preview shares one observer, made on first use: its callback stands in for the browser's resize reports.
  let notify: ((entries: Entry[]) => void) | null = null;
  globalThis.ResizeObserver = class {
    constructor(callback: (entries: Entry[]) => void) {
      notify = callback;
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;

  test("fits a batch with one layout read pass, not one per card", async () => {
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

  type Laid = { width: string; height: string; transform: string };

  /**
   * A card's preview on a fake DOM, driven the way the deck drives it: the
   * card's box and the stage's padding morph together, then the box springs
   * on past its end. `canvas` gives it a canvas that takes the stage's size.
   * `mounted` is the end the card was at when its preview mounted.
   */
  async function flyingPreview({ canvas = false, mounted = "page" as "tile" | "page" } = {}) {
    const { observeFit } = await import("./fitPreview");

    const style: Record<string, string> = {};
    const layoutWidth = () => parseFloat(style.width ?? "0");
    const layoutHeight = () => parseFloat(style.height ?? "0");
    const content = {
      style,
      get clientWidth() {
        return layoutWidth();
      },
      get clientHeight() {
        return layoutHeight();
      },
      firstElementChild: {
        get scrollWidth() {
          return layoutWidth();
        },
        get scrollHeight() {
          return layoutHeight();
        },
      },
      querySelectorAll: () =>
        canvas ? [{ get width() { return Math.round(layoutWidth()); }, get height() { return Math.round(layoutHeight()); } }] : [],
    };
    // The card as the deck lays it out, and the padding its stage has at each end: a tile's 16px, a page's chrome and footer.
    const cards = { tile: { width: 288, height: 288 }, page: { width: 1408, height: 868 } };
    const pads = { tile: { width: 32, height: 32 }, page: { width: 48, height: 196 } };
    // The footer is part of the page's padding and wraps taller in a narrow card: near the tile, the padding heads for this.
    const footerWrap = 40;
    const mix = (a: Size, b: Size, t: number) => ({ width: a.width * (1 - t) + b.width * t, height: a.height * (1 - t) + b.height * t });
    const flight = {
      progress: new MotionValue(mounted === "page" ? 1 : 0),
      box: [new MotionValue(cards[mounted].width), new MotionValue(cards[mounted].height)] as const,
      ends: () => cards,
    };
    const area = { clientWidth: cards[mounted].width - pads[mounted].width, clientHeight: cards[mounted].height - pads[mounted].height };
    /**
     * Puts the card `t` of the way from tile to page, `past` pixels beyond it, and reports the stage's new size.
     * The padding goes by the morph itself, which may be sprung past its end.
     */
    const move = (t: number, past = 0, morph = t) => {
      const card = mix(cards.tile, cards.page, t);
      const narrow = 1 - Math.min(1, Math.max(0, t * 2));
      const pad = mix(pads.tile, { width: pads.page.width, height: pads.page.height + footerWrap * narrow }, morph);
      flight.box[0].set(card.width + past);
      flight.box[1].set(card.height + past / 2);
      notify!([{ target: area, contentRect: { width: card.width + past - pad.width, height: card.height + past / 2 - pad.height } }]);
      return { width: style.width!, height: style.height!, transform: style.transform! };
    };
    const animating = (on: boolean, values: readonly MotionValue[]) => {
      for (const value of values) value.animation = on ? ({} as Animation) : undefined;
    };

    observeFit(area as unknown as HTMLElement, content as unknown as HTMLElement, flight);
    if (mounted === "page") {
      // The deck mounts a card on screen as a page, then places it in the grid: both rests are known before any flight.
      flight.progress.jump(0);
      move(0);
    }

    /** Flies to the page (1) or back to the tile (0), then lets the box spring on before it rests. `during` runs before each frame. */
    const fly = (to: 0 | 1, frames = 30, during: (frame: number) => void = () => {}) => {
      animating(true, [flight.progress, ...flight.box]);
      const flying: Laid[] = [];
      for (let frame = 1; frame <= frames; frame++) {
        during(frame);
        const t = to === 1 ? frame / frames : 1 - frame / frames;
        flight.progress.set(t);
        flying.push(move(t));
      }
      // The morph springs a little past its end and eases back, as the box does: both are still animating.
      const springing = [4, 2.5, 1, 0.25].map(past => {
        const morph = to === 1 ? 1 + past / 100 : -past / 100;
        flight.progress.set(morph);
        return move(to, past, morph);
      });
      // The box comes to rest a moment before the morph has finished easing back.
      animating(false, flight.box);
      const easing = to === 1 ? 1.005 : -0.005;
      flight.progress.set(easing);
      springing.push(move(to, 0, easing));
      animating(false, [flight.progress]);
      flight.progress.set(to);
      return { flying, springing, rest: move(to) };
    };
    /** The deck places the card at an end while it is off screen: the browser lays nothing out there, so no resize is reported. */
    const placeOffScreen = (end: "tile" | "page") => {
      flight.progress.jump(end === "page" ? 1 : 0);
      flight.box[0].jump(cards[end].width);
      flight.box[1].jump(cards[end].height);
      while (frames.length > 0) frames.shift()!(performance.now());
    };
    /**
     * Flies to the page as a spring can end: its last frames reach the target and set nothing new, and the
     * animation then ends with no value changing. The stage reports its last size while the card still counts as moving.
     */
    const flyEndingQuietly = () => {
      animating(true, [flight.progress, ...flight.box]);
      const runFrames = () => {
        for (let frame = frames.length; frame > 0; frame--) frames.shift()!(performance.now());
      };
      for (let frame = 1; frame <= 30; frame++) {
        flight.progress.set(frame / 30);
        move(frame / 30);
        runFrames();
      }
      // A few more frames at the target, then the animations end.
      runFrames();
      animating(false, [flight.progress, ...flight.box]);
      runFrames();
      return { width: style.width!, height: style.height!, transform: style.transform! };
    };
    return { fly, cards, pads, placeOffScreen, move, flyEndingQuietly };
  }

  const widths = (frames: Laid[]) => frames.map(frame => frame.width);
  const sizes = (frames: Laid[]) => frames.map(frame => `${frame.width} x ${frame.height}`);

  test("a preview lays out every frame of a flight, so its content never jumps in size", async () => {
    const { fly } = await flyingPreview();
    const { flying } = fly(1);
    expect(new Set(widths(flying)).size).toBe(30);
    widths(flying).forEach((width, frame) => {
      if (frame > 0) expect(parseFloat(width)).toBeGreaterThan(parseFloat(widths(flying)[frame - 1]!));
    });
    expect(flying.at(-1)!.width).toBe("1360px");
  });

  test("once a canvas is seen to resize with the layout, the preview lays out only at its stops, and last at the layout it lands on", async () => {
    const { fly } = await flyingPreview({ canvas: true });
    const stops = flightStops({ width: 320, height: 320 }, { width: 1360, height: 672 });
    const stopWidths = stops.map(stop => 320 * (1 - stop) + 1360 * stop);
    const atStops = (laid: string[]) => laid.every(width => stopWidths.some(stop => Math.abs(stop - parseFloat(width)) < 0.01));
    // The first two fits of its first flight are how the canvas is found out.
    const first = widths(fly(1).flying);
    expect(atStops(first.slice(2))).toBe(true);
    expect(first.at(-1)).toBe("1360px");
    for (const to of [0, 1] as const) {
      const laid = widths(fly(to).flying);
      expect(atStops(laid)).toBe(true);
      expect(new Set(laid).size).toBeLessThanOrEqual(stops.length);
      expect(laid.at(-1)).toBe(to === 1 ? "1360px" : "320px");
      // The layout it lands on is in from the last stop before it: a whole step of the flight is left to fly.
      const lastStop = to === 1 ? stops.at(-2)! : 1 - stops[1]!;
      const landingFrom = laid.indexOf(laid.at(-1)!) + 1;
      expect(landingFrom / 30).toBeLessThanOrEqual(lastStop + 1 / 30);
    }
  });

  test("arriving lays nothing out again: the rest layout is in place and only its scale follows the box to rest", async () => {
    for (const canvas of [false, true]) {
      const { fly } = await flyingPreview({ canvas });
      const page = fly(1);
      expect(new Set(sizes([page.flying.at(-1)!, ...page.springing, page.rest]))).toEqual(new Set(["1360px x 672px"]));
      // Sprung past the page, the stage is a little off its resting size: the layout stays and is drawn to fit it.
      expect(page.springing[0]!.transform).toMatch(/scale\((0\.99|1\.00)\d+\)/);
      expect(page.rest.transform).toBe("");
      const tile = fly(0);
      expect(new Set(sizes([tile.flying.at(-1)!, ...tile.springing, tile.rest]))).toEqual(new Set(["320px x 320px"]));
      expect(tile.rest.transform).toBe("scale(0.8)");
    }
  });

  test("a page resized while the card is a tile is flown to at its new size, with nothing left to lay out on arrival", async () => {
    const { fly, cards } = await flyingPreview();
    fly(1);
    fly(0);
    // The window grew shorter while the grid showed: only the page changed, and no stage was resized to say so.
    cards.page = { width: 1408, height: 618 };
    const page = fly(1);
    expect(sizes(page.flying)).not.toContain("1360px x 672px");
    expect(new Set(sizes([page.flying.at(-1)!, ...page.springing, page.rest]))).toEqual(new Set(["1360px x 422px"]));
    expect(page.rest.transform).toBe("");
  });

  test("a card resized in the middle of a flight carries on toward its new size", async () => {
    const { fly, cards } = await flyingPreview();
    fly(1);
    fly(0);
    // Halfway to the page the window is resized, and the deck lays the page out smaller.
    const page = fly(1, 30, frame => {
      if (frame === 16) cards.page = { width: 1200, height: 700 };
    });
    const before = page.flying.slice(0, 15).map(frame => parseFloat(frame.width));
    const after = page.flying.slice(15).map(frame => parseFloat(frame.width));
    // Up to the resize it was halfway to a 1360px layout; from it, the same share of the way to a 1152px one.
    expect(before.at(-1)!).toBeCloseTo(320 + (1360 - 320) * 0.5, 6);
    expect(after[0]!).toBeCloseTo(320 + (1152 - 320) * (16 / 30), 6);
    expect(Math.max(...after)).toBe(1152);
    expect(new Set(sizes([page.flying.at(-1)!, ...page.springing, page.rest]))).toEqual(new Set(["1152px x 504px"]));
    expect(page.rest.transform).toBe("");
  });

  test("a rest whose padding no longer holds is not trusted: the layout the box is heading for goes in as the morph lands, once", async () => {
    const { fly, pads } = await flyingPreview();
    fly(1);
    fly(0);
    // The page's footer wrapped onto a second line since the preview last rested there.
    pads.page = { width: 48, height: 216 };
    const page = fly(1);
    expect(new Set(sizes([...page.springing, page.rest]))).toEqual(new Set(["1360px x 652px"]));
  });

  test("a preview that has never rested as a page fits each frame on the way, then holds the layout its box is heading for", async () => {
    const { fly } = await flyingPreview({ mounted: "tile" });
    const page = fly(1);
    expect(new Set(sizes(page.flying)).size).toBe(30);
    expect(new Set(sizes([...page.springing, page.rest]))).toEqual(new Set(["1360px x 672px"]));
    expect(page.rest.transform).toBe("");
    // Now it has: the way back blends, and arrives with its tile layout in place.
    const tile = fly(0);
    expect(new Set(sizes([tile.flying.at(-1)!, ...tile.springing, tile.rest]))).toEqual(new Set(["320px x 320px"]));
  });

  test("a card placed off screen as a page learns nothing false about its page: its first flight fits each frame and still arrives whole", async () => {
    const { fly, placeOffScreen, move } = await flyingPreview({ mounted: "tile" });
    // Another card is opened: this one is put where its page goes, far off screen, then back in the grid.
    placeOffScreen("page");
    placeOffScreen("tile");
    move(0);
    const page = fly(1);
    expect(new Set(sizes(page.flying)).size).toBe(30);
    expect(new Set(sizes([...page.springing, page.rest]))).toEqual(new Set(["1360px x 672px"]));
  });

  test("a card whose spring ends without a last change still has its preview fitted to where it rests", async () => {
    const { fly, pads, flyEndingQuietly } = await flyingPreview();
    fly(1);
    fly(0);
    // The page's padding is now a fraction off what was remembered: the landing layout is a hair out, and is set right at rest.
    pads.page = { width: 48, height: 196.6 };
    expect(flyEndingQuietly()).toMatchObject({ width: "1360px", height: "671.4px", transform: "" });
  });
});
