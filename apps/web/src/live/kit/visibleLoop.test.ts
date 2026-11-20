import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { visibleLoop, type FrameRequest } from "./visibleLoop";

type Entry = { isIntersecting: boolean };

let frames = new Map<number, FrameRequestCallback>();
let timers = new Map<number, () => void>();
let nextId = 1;
let clock = 0;
let report: ((entries: Entry[]) => void) | null = null;
let disconnected = false;
const saved = { ...globalThis };
const realNow = performance.now.bind(performance);

class FakeIntersectionObserver {
  constructor(callback: (entries: Entry[]) => void) {
    report = callback;
  }
  observe() {}
  disconnect() {
    disconnected = true;
  }
}

function runFrame(at: number) {
  clock = at;
  const queued = [...frames.values()];
  frames = new Map();
  for (const callback of queued) callback(at);
}

function runTimers() {
  const due = [...timers.values()];
  timers = new Map();
  for (const callback of due) callback();
}

beforeEach(() => {
  frames = new Map();
  timers = new Map();
  clock = 0;
  report = null;
  disconnected = false;
  Object.assign(globalThis, {
    IntersectionObserver: FakeIntersectionObserver,
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      frames.set(nextId, callback);
      return nextId++;
    },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    setTimeout: (callback: () => void) => {
      timers.set(nextId, callback);
      return nextId++;
    },
    clearTimeout: (id: number) => timers.delete(id),
  });
  performance.now = () => clock;
});

afterEach(() => {
  Object.assign(globalThis, {
    IntersectionObserver: saved.IntersectionObserver,
    requestAnimationFrame: saved.requestAnimationFrame,
    cancelAnimationFrame: saved.cancelAnimationFrame,
    setTimeout: saved.setTimeout,
    clearTimeout: saved.clearTimeout,
  });
  performance.now = realNow;
});

function loopWith(answers: FrameRequest[]) {
  const seen: Array<[number, number]> = [];
  const loop = visibleLoop({} as Element, (now, delta) => {
    seen.push([now, delta]);
    return answers.shift();
  });
  return { loop, seen };
}

describe("visibleLoop", () => {
  test("starts once the target is reported on screen, and runs while frames ask for more", () => {
    const { seen } = loopWith([true, true, undefined]);
    expect(frames.size).toBe(0);
    report?.([{ isIntersecting: true }]);
    runFrame(16);
    runFrame(32);
    runFrame(48);
    runFrame(64);
    expect(seen).toEqual([
      [16, 16],
      [32, 16],
      [48, 16],
    ]);
    expect(frames.size).toBe(0);
  });

  test("measures the first frame after a sleep from the wake, not from the last frame", () => {
    const { loop, seen } = loopWith([undefined, undefined]);
    loop.wake();
    runFrame(16);
    clock = 1000;
    loop.wake();
    runFrame(1016);
    expect(seen).toEqual([
      [16, 16],
      [1016, 16],
    ]);
  });

  test("a number waits that long, then runs a frame", () => {
    const { loop, seen } = loopWith([400, undefined]);
    loop.wake();
    runFrame(16);
    expect(frames.size).toBe(0);
    expect(timers.size).toBe(1);
    runTimers();
    runFrame(432);
    expect(seen.map(([now]) => now)).toEqual([16, 432]);
  });

  test("leaving the screen drops the queued frame and wait, and coming back wakes it", () => {
    const changes: boolean[] = [];
    const loop = visibleLoop({} as Element, () => 400, { onVisibleChange: visible => changes.push(visible) });
    loop.wake();
    runFrame(16);
    expect(timers.size).toBe(1);

    report?.([{ isIntersecting: false }]);
    expect(loop.visible).toBe(false);
    expect(timers.size).toBe(0);
    loop.wake();
    expect(frames.size).toBe(0);

    report?.([{ isIntersecting: true }]);
    expect(frames.size).toBe(1);
    expect(changes).toEqual([false, true]);
  });

  test("a frame that wakes the loop itself queues only one next frame", () => {
    const loop: { current?: ReturnType<typeof visibleLoop> } = {};
    loop.current = visibleLoop({} as Element, () => {
      loop.current?.wake();
      return true;
    });
    loop.current.wake();
    runFrame(16);
    expect(frames.size).toBe(1);
  });

  test("a wake from inside a frame keeps measuring from that frame", () => {
    const seen: number[] = [];
    const loop: { current?: ReturnType<typeof visibleLoop> } = {};
    loop.current = visibleLoop({} as Element, (now, delta) => {
      seen.push(delta);
      clock = now + 9;
      loop.current?.wake();
    });
    loop.current.wake();
    runFrame(16);
    runFrame(32);
    expect(seen).toEqual([16, 16]);
  });

  test("a frame that puts the loop to sleep stays asleep, whatever it returns", () => {
    const loop: { current?: ReturnType<typeof visibleLoop> } = {};
    let runs = 0;
    loop.current = visibleLoop({} as Element, () => {
      runs++;
      loop.current?.sleep();
      return true;
    });
    loop.current.wake();
    runFrame(16);
    runFrame(32);
    expect(runs).toBe(1);
  });

  test("a loop put to sleep stays asleep through visibility reports until it is woken", () => {
    const changes: boolean[] = [];
    const { loop, seen } = (() => {
      const seen: number[] = [];
      const loop = visibleLoop({} as Element, now => void seen.push(now), { onVisibleChange: visible => changes.push(visible) });
      return { loop, seen };
    })();
    loop.wake();
    loop.sleep();
    report?.([{ isIntersecting: true }]);
    report?.([{ isIntersecting: false }]);
    report?.([{ isIntersecting: true }]);
    runFrame(16);
    expect(seen).toEqual([]);
    expect(changes).toEqual([false, true]);
    loop.wake();
    runFrame(32);
    expect(seen).toEqual([32]);
  });

  test("a visibility report delivered after stop is ignored", () => {
    const changes: boolean[] = [];
    const loop = visibleLoop({} as Element, () => true, { onVisibleChange: visible => changes.push(visible) });
    loop.stop();
    report?.([{ isIntersecting: false }]);
    report?.([{ isIntersecting: true }]);
    expect(changes).toEqual([]);
    expect(frames.size).toBe(0);
  });

  test("initiallyVisible: false runs nothing until the target is first seen, then announces it", () => {
    const changes: boolean[] = [];
    const loop = visibleLoop({} as Element, () => undefined, {
      initiallyVisible: false,
      onVisibleChange: visible => changes.push(visible),
    });
    expect(loop.visible).toBe(false);
    loop.wake();
    expect(frames.size).toBe(0);
    report?.([{ isIntersecting: true }]);
    expect(changes).toEqual([true]);
    expect(frames.size).toBe(1);
  });

  test("stop drops everything and ignores later wakes", () => {
    const { loop } = loopWith([true]);
    loop.wake();
    loop.stop();
    loop.wake();
    expect(frames.size).toBe(0);
    expect(disconnected).toBe(true);
  });
});
