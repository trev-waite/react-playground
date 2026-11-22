import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { judgeFlight } from "./judge.ts";
import { installFlightRecorder, type Flight, type FlightRecorder, type Frame } from "./recorder.ts";

/** A flight sampled every 16ms: the card moves `speed` pixels a frame until `lands`, then stays put. */
function flight(lands: number, change: (frame: Frame, index: number) => void = () => {}, shift = 0): Flight {
  const frames = Array.from({ length: lands + 6 }, (_, index): Frame => {
    const flying = index > 0 && index <= lands;
    const nearingRest = index > lands - 25;
    return { at: index * 16, flying, moved: flying && !nearingRest ? 40 : flying ? 1 : 0, layout: [1200, 572], sizes: [0.2, 0.1] };
  });
  frames.forEach(change);
  return { frames, shift, shiftInAll: shift };
}

describe("judgeFlight", () => {
  test("passes a flight whose preview holds its size and layout as the card comes to rest", () => {
    expect(judgeFlight("Opening Controls", flight(60))).toEqual([]);
  });

  test("ignores a change of size while the card is still moving fast, where a stepped preview lays out again", () => {
    const stepped = flight(60, (frame, index) => {
      if (index >= 20) {
        frame.sizes = [0.17, 0.085];
        frame.layout = [1410, 672];
      }
    });
    expect(judgeFlight("Opening Moon Phase", stepped)).toEqual([]);
  });

  test("fails a preview laid out anew, its content jumping in size, once the card has all but stopped", () => {
    const jumped = flight(60, (frame, index) => {
      if (index >= 50) {
        frame.sizes = [0.23, 0.115];
        frame.layout = [1040, 496];
      }
    });
    expect(judgeFlight("Closing Profile Button", jumped)).toContain(
      "Closing Profile Button: the preview's content jumped 15% in size while its card was all but still.",
    );
  });

  test("leaves a change of size with no new layout to the component: a canvas it sizes itself, a control that grows under the pointer", () => {
    const own = flight(60, (frame, index) => {
      if (index >= 50) frame.sizes = [0.23, 0.115];
    });
    expect(judgeFlight("Closing Moon Phase", own)).toEqual([]);
  });

  test("fails a preview that is still laying out in the last moments of the flight, but not for a rounding's worth", () => {
    const late = flight(60, (frame, index) => {
      if (index >= 55) frame.layout = [1200, 574];
    });
    expect(judgeFlight("Opening Menu Pill", late)).toEqual([
      "Opening Menu Pill: the preview was still laying out as it arrived (1200 × 572 → 1200 × 574).",
    ]);
    const rounded = flight(60, (frame, index) => {
      if (index >= 55) frame.layout = [1200, 572.007];
    });
    expect(judgeFlight("Opening Menu Pill", rounded)).toEqual([]);
  });

  test("fails a flight the browser scored a layout shift for", () => {
    expect(judgeFlight("Opening Controls", flight(60, undefined, 0.07))).toEqual([
      "Opening Controls: the browser scored a layout shift of 0.070 for the cards around it, though nothing on screen jumped.",
    ]);
  });

  test("fails a card that stops short of its page and then jumps the rest of the way", () => {
    const short = flight(60, (frame, index) => {
      if (index >= 20 && index < 50) frame.moved = 0;
      if (index === 50) frame.moved = 246;
    });
    expect(judgeFlight("Opening Focus Pull", short)).toEqual(["Opening Focus Pull: the card stopped short of its place, then jumped 246px."]);
  });

  test("reads one long frame after slow ones as the motion it covers, not a jump", () => {
    const sparse = flight(60, (frame, index) => {
      if (index > 40 && index <= 60) frame.moved = 2;
      if (index > 50) frame.at += 64;
      if (index === 51) frame.moved = 17;
    });
    expect(judgeFlight("Opening Controls", sparse)).toEqual([]);
  });

  test("lets a card ease the last pixels into place", () => {
    const easing = flight(60, (frame, index) => {
      if (index > 40 && index <= 60) frame.moved = 6;
    });
    expect(judgeFlight("Opening Controls", easing)).toEqual([]);
  });

  test("says so when no flight was seen, rather than pass an empty recording", () => {
    const still = flight(60, frame => {
      frame.flying = false;
    });
    expect(judgeFlight("Opening Controls", still)).toEqual(["Opening Controls: the flight was not seen (66 frames)."]);
  });
});

describe("the flight recorder", () => {
  /** The page as the recorder sees it: frames and painted messages are held until the test lets them through. */
  const frames = new Map<number, () => void>();
  const messages: (() => void)[] = [];
  let ports = 0;
  const real = {
    window: Object.getOwnPropertyDescriptor(globalThis, "window"),
    document: Object.getOwnPropertyDescriptor(globalThis, "document"),
    observer: globalThis.PerformanceObserver,
    channel: globalThis.MessageChannel,
    request: globalThis.requestAnimationFrame,
    cancel: globalThis.cancelAnimationFrame,
  };
  const box = { x: 0, y: 0, width: 600, height: 300 };
  /** Hands the recorder a layout shift as the browser would report it. */
  let report: (entries: object[]) => void = () => {};
  /** Stands in for a DOM element: all the recorder asks of a shifted node is which card it is in. */
  class FakeElement {
    constructor(readonly card: object | null) {}
    closest() {
      return this.card;
    }
  }
  const flying = { getAttribute: () => "Controls", getBoundingClientRect: () => ({ ...box }), querySelector: () => ({ style: { width: "700px", height: "320px" }, querySelectorAll: () => [] }) };
  const neighbour = {};

  beforeAll(() => {
    Object.defineProperty(globalThis, "window", { value: globalThis, configurable: true });
    Object.defineProperty(globalThis, "document", {
      value: { querySelectorAll: () => [flying], querySelector: () => ({ hasAttribute: () => true }) },
      configurable: true,
    });
    Object.defineProperty(globalThis, "Element", { value: FakeElement, configurable: true });
    globalThis.PerformanceObserver = class {
      constructor(callback: (list: { getEntries: () => object[] }) => void) {
        report = entries => callback({ getEntries: () => entries });
      }
      observe() {}
    } as unknown as typeof PerformanceObserver;
    globalThis.MessageChannel = class {
      port1 = { onmessage: null as (() => void) | null, close: () => void ports-- };
      port2 = { postMessage: () => void messages.push(() => this.port1.onmessage?.()), close: () => {} };
      constructor() {
        ports++;
      }
    } as unknown as typeof MessageChannel;
    let id = 0;
    globalThis.requestAnimationFrame = callback => {
      frames.set(++id, () => callback(0));
      return id;
    };
    globalThis.cancelAnimationFrame = handle => void frames.delete(handle);
    installFlightRecorder();
  });

  afterAll(() => {
    delete (globalThis as Record<string, unknown>).Element;
    for (const name of ["window", "document"] as const) {
      if (real[name]) Object.defineProperty(globalThis, name, real[name]);
      else delete (globalThis as Record<string, unknown>)[name];
    }
    globalThis.PerformanceObserver = real.observer;
    globalThis.MessageChannel = real.channel;
    globalThis.requestAnimationFrame = real.request;
    globalThis.cancelAnimationFrame = real.cancel;
  });

  const recorder = () => (globalThis as unknown as { flightRecorder: FlightRecorder }).flightRecorder;
  /** Runs the frames asked for, then delivers what they posted: one painted frame. */
  const paint = () => {
    const due = [...frames.values()];
    frames.clear();
    for (const run of due) run();
    for (const deliver of messages.splice(0)) deliver();
  };

  test("samples once per painted frame", () => {
    recorder().record("Controls");
    paint();
    paint();
    paint();
    expect(recorder().stop().frames).toHaveLength(3);
  });

  test("a stopped recording never wakes inside the next: one left waiting on a frame is cancelled, and one waiting to be told of a paint stays silent", () => {
    recorder().record("Controls");
    paint();
    // A frame has run and posted its paint, but the message has not arrived when this recording stops.
    const due = [...frames.values()];
    frames.clear();
    for (const run of due) run();
    expect(recorder().stop().frames).toHaveLength(1);

    recorder().record("Controls");
    for (const deliver of messages.splice(0)) deliver();
    paint();
    paint();
    const second = recorder().stop();
    expect(second.frames).toHaveLength(2);
    expect(frames.size).toBe(0);
    expect(ports).toBe(0);
  });

  test("starting a recording ends one that was never stopped", () => {
    recorder().record("Controls");
    paint();
    recorder().record("Controls");
    paint();
    paint();
    expect(recorder().stop().frames).toHaveLength(2);
    expect(() => recorder().stop()).toThrow("No flight is being recorded.");
  });

  test("totals the shifts scored for the cards around the flying one, since the recording began, and leaves out what a click excuses", () => {
    const shifted = (card: object, value: number, at = performance.now(), hadRecentInput = false) => ({
      startTime: at,
      value,
      hadRecentInput,
      sources: [{ node: new FakeElement(card) }],
    });
    report([shifted(neighbour, 0.4, performance.now() - 1)]);
    recorder().record("Controls");
    report([shifted(neighbour, 0.07), shifted(flying, 0.2), shifted(neighbour, 0.5, undefined, true), shifted(neighbour, 0.01)]);
    const scored = recorder().stop();
    expect(scored.shift).toBeCloseTo(0.08, 9);
    expect(scored.shiftInAll).toBeCloseTo(0.28, 9);
  });
});
