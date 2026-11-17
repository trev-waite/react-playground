import { describe, expect, test } from "bun:test";
import {
  MAX_STRETCH,
  POP_KICK,
  POP_SPRING,
  STRETCH_SPRING,
  atRest,
  fills,
  keyValue,
  settle,
  pillShape,
  shapedX,
  stepSpring,
  stretchFor,
  touchIntent,
  fractionAt,
  layoutX,
  fillOffset,
  MIN_FILL,
  HANDLE_INSET,
  CALM_SPEED,
  FOLLOW_SPRING,
  HANDLE_HEIGHT,
  PARK_GAP,
  PARK_SPRING,
  dragValue,
  fillOpacity,
  halfLength,
  scrubAt,
  parkedX,
  retracted,
  splitAt,
  topHalf,
  type NumberBox,
  type SpringState,
} from "./stretch";

function run(spring: typeof POP_SPRING, start: SpringState, target: number, seconds: number) {
  let state = start;
  const trace: number[] = [];
  for (let t = 0; t < seconds; t += 1 / 60) {
    state = stepSpring(state, target, spring, 1 / 60);
    trace.push(state.value);
  }
  return { state, trace };
}

describe("Stretch Slider value", () => {
  test("a slow drag reaches every value, 99 included, both ways", () => {
    const seen = (from: number, to: number) => {
      const values = new Set<number>();
      let value = from;
      for (let step = 0; step <= 400; step++) {
        value = settle(from + ((to - from) * step) / 400, value);
        values.add(value);
      }
      return values;
    };
    const up = seen(90, 100);
    const down = seen(100, 90);
    for (let value = 90; value <= 100; value++) {
      expect(up.has(value)).toBe(true);
      expect(down.has(value)).toBe(true);
    }
  });

  test("a pointer wavering between two values holds one, so the slider never flickers or pops twice", () => {
    for (const [start, wobble] of [[99, [99.4, 99.6, 99.2, 99.8, 99.5, 99.9, 99.3]], [100, [99.6, 99.1, 99.9, 99.2, 100, 99.4]]] as const) {
      let value: number = start;
      let pops = 0;
      for (const raw of wobble) {
        const next = settle(raw, value);
        if (fills(value, next)) pops++;
        value = next;
      }
      expect(value).toBe(start);
      expect(pops).toBe(0);
    }
  });

  test("puts the handle under the pointer, and clamps past either end", () => {
    const width = 300;
    for (const fraction of [0, 0.25, 0.5, 1]) {
      const handle = 10 + width + fillOffset(fraction, width) - HANDLE_INSET;
      expect(fractionAt(handle, 10, width)).toBeCloseTo(fraction);
    }
    expect(fractionAt(-40, 10, width)).toBe(0);
    expect(fractionAt(900, 10, width)).toBe(1);
    expect(fractionAt(50, 10, MIN_FILL)).toBe(0);
  });

  test("reads the pointer in layout px when the deck draws the slider scaled down", () => {
    const width = 360;
    const scale = 0.75;
    const end = 10 + width + fillOffset(1, width) - HANDLE_INSET;
    const onScreen = 100 + end * scale;
    expect(fractionAt(layoutX(onScreen, 100, width * scale, width), 10, width)).toBeCloseTo(1);
    expect(layoutX(140, 100, 0, 0)).toBe(40);
  });

  test("the fill never shrinks past room for the number and the handle", () => {
    expect(300 + fillOffset(0, 300)).toBe(MIN_FILL);
    expect(fillOffset(1, 300)).toBeCloseTo(0);
  });

  test("keys step by one, Shift and Page keys by ten, Home and End jump to the ends", () => {
    expect(keyValue("ArrowRight", 40, false)).toBe(41);
    expect(keyValue("ArrowDown", 40, false)).toBe(39);
    expect(keyValue("ArrowRight", 95, true)).toBe(100);
    expect(keyValue("PageDown", 5, false)).toBe(0);
    expect(keyValue("Home", 60, false)).toBe(0);
    expect(keyValue("End", 60, false)).toBe(100);
    expect(keyValue("a", 60, false)).toBeNull();
  });

  test("pops only on the change that fills it", () => {
    expect(fills(99, 100)).toBe(true);
    expect(fills(20, 100)).toBe(true);
    expect(fills(100, 100)).toBe(false);
    expect(fills(100, 99)).toBe(false);
    expect(fills(50, 99)).toBe(false);
  });

  test("a finger slides only once it moves farther across than down", () => {
    expect(touchIntent(3, 2)).toBeNull();
    expect(touchIntent(10, 4)).toBe("slide");
    expect(touchIntent(4, 10)).toBe("scroll");
  });
});

describe("Stretch Slider at 0", () => {
  const channel = 47;
  const width = 2.5;
  const box = (digits: number): NumberBox => ({ left: 15.5, right: 15.5 + 17 + digits * 10.5, half: 9 });
  const lineTop = -(channel * HANDLE_HEIGHT) / 2;

  test("the line is whole on the fill's edge and at rest at 0, and parts only to pass the number", () => {
    const travel = 200;
    for (const value of [0, 1, 9, 10, 99, 100]) {
      const number = box(String(value).length);
      const parked = parkedX(number, width);
      expect(splitAt(parked, parked, number, width)).toBe(0);
      expect(splitAt(MIN_FILL - HANDLE_INSET + (travel * value) / 100, parked, number, width)).toBe(0);
      for (let x = number.left - width / 2; x <= number.right + width / 2; x += 0.5) expect(splitAt(x, parked, number, width)).toBe(1);
    }
  });

  test("past the fill's emptiest, a drag holds the line under the pointer, over the number to the very left", () => {
    const number = box(1);
    const parked = parkedX(number, width);
    const edge = MIN_FILL - HANDLE_INSET;
    expect(scrubAt(edge, parked)).toBe(0);
    expect(scrubAt(edge + 30, parked)).toBe(0);
    expect(scrubAt(parked, parked)).toBe(1);
    expect(scrubAt(parked - 20, parked)).toBe(1);
    for (let x = parked; x <= edge; x += 3) expect(edge + (parked - edge) * scrubAt(x, parked)).toBeCloseTo(x);
  });

  test("a drag reads 0 only with the line at the very left, never on the fill's edge, and does not flicker there", () => {
    expect(dragValue(0, 0, 5)).toBe(1);
    expect(dragValue(0, 0.5, 1)).toBe(1);
    expect(dragValue(0, 0.96, 1)).toBe(1);
    expect(dragValue(0, 1, 1)).toBe(0);
    let value = 1;
    const seen: number[] = [];
    for (const scrub of [0.95, 0.98, 0.94, 1, 0.92, 0.97, 0.91]) {
      value = dragValue(0, scrub, value);
      seen.push(value);
    }
    expect(seen).toEqual([1, 0, 0, 0, 0, 0, 0]);
    expect(dragValue(0, 0.85, 0)).toBe(1);
    expect(dragValue(0.37, 0, 0)).toBe(37);
    expect(dragValue(0.004, 0, 0)).toBe(1);
  });

  test("at 0 the line rests a clear 8px left of the number", () => {
    const number = box(1);
    expect(number.left - (parkedX(number, width) + width / 2)).toBe(PARK_GAP);
  });

  test("joined, the halves make the one line with no seam; parted, they clear the number inside the pill", () => {
    const number = box(1);
    const length = halfLength(channel);
    const joined = topHalf(0, channel, number);
    expect(joined.y - length / 2).toBeCloseTo(lineTop);
    expect(joined.y + length / 2).toBeGreaterThan(0);
    const apart = topHalf(1, channel, number);
    expect(apart.y + (length * apart.scale) / 2).toBeLessThanOrEqual(-number.half + 1e-9);
    expect(apart.y - (length * apart.scale) / 2).toBeGreaterThan(-channel / 2 + 3);
  });

  test("the grey is gone, not lingering, by the time the line rests at 0, and untouched away from it", () => {
    expect(retracted(0)).toBe(0);
    expect(fillOpacity(0)).toBe(1);
    expect(retracted(1)).toBe(1);
    expect(fillOpacity(1)).toBe(0);
    expect(fillOpacity(0.3)).toBe(1);
  });

  test("on the way to 0 and back, no half ever jumps between frames", () => {
    const number = box(1);
    const parked = parkedX(number, width);
    const edge = MIN_FILL - HANDLE_INSET;
    let park: SpringState = { value: 0, velocity: 0 };
    let last: { x: number; y: number } | null = null;
    let largest = 0;
    for (const target of [1, 0]) {
      for (let frame = 0; frame < 45; frame++) {
        park = stepSpring(park, target, PARK_SPRING, 1 / 60);
        const x = edge + (parked - edge) * park.value;
        const half = topHalf(splitAt(x, parked, number, width), channel, number);
        if (last) largest = Math.max(largest, Math.hypot(x - last.x, half.y - last.y));
        last = { x, y: half.y };
      }
    }
    expect(largest).toBeLessThan(9);
    expect(park.value).toBeCloseTo(0, 2);
  });
});

describe("Stretch Slider shape", () => {
  test("an ordinary drag keeps the pill's shape; only a flick stretches it, toward the drag, up to a cap", () => {
    expect(stretchFor(0)).toBe(0);
    expect(stretchFor(CALM_SPEED)).toBe(0);
    expect(stretchFor(-CALM_SPEED * 0.9)).toBe(0);
    expect(stretchFor(CALM_SPEED + 1)).toBeGreaterThan(0);
    expect(stretchFor(-(CALM_SPEED + 1))).toBe(-stretchFor(CALM_SPEED + 1));
    expect(stretchFor(CALM_SPEED + 2)).toBeGreaterThan(stretchFor(CALM_SPEED + 1));
    expect(stretchFor(50)).toBe(MAX_STRETCH);
  });

  test("the fill glides after a steady drag without overshooting or falling far behind", () => {
    let state: SpringState = { value: 0, velocity: 0 };
    const speed = 0.8;
    let target = 0;
    let lag = 0;
    let overshoot = 0;
    for (let frame = 0; frame < 60; frame++) {
      target = Math.min(1, target + speed / 60);
      state = stepSpring(state, target, FOLLOW_SPRING, 1 / 60);
      if (frame > 10 && target < 1) lag = Math.max(lag, (target - state.value) / speed);
      overshoot = Math.max(overshoot, state.value - 1);
    }
    expect(lag).toBeLessThan(0.04);
    expect(overshoot).toBeLessThan(0.001);
  });

  test("a stretch leaves the trailing edge in place and leads with the edge the drag pulls", () => {
    const width = 300;
    const right = pillShape(0.1, 0, width);
    expect(shapedX(0, right, width)).toBeCloseTo(0);
    expect(shapedX(width, right, width)).toBeCloseTo(width * 1.1);
    const left = pillShape(-0.1, 0, width);
    expect(shapedX(width, left, width)).toBeCloseTo(width);
    expect(shapedX(0, left, width)).toBeCloseTo(-width * 0.1);
  });

  test("a stretched pill thins, and at rest it is untouched", () => {
    expect(pillShape(0.1, 0, 300).scaleY).toBeLessThan(1);
    expect(pillShape(0, 0, 300)).toEqual({ scaleX: 1, scaleY: 1, shiftX: 0 });
  });
});

describe("Stretch Slider springs", () => {
  test("the pop rings past rest a few times, like a plucked band, then settles", () => {
    const { state, trace } = run(POP_SPRING, { value: 0, velocity: POP_KICK }, 0, 1.6);
    const crossings = trace.slice(1).filter((value, index) => Math.sign(value) !== Math.sign(trace[index]!)).length;
    expect(Math.max(...trace)).toBeGreaterThan(0.06);
    expect(Math.max(...trace)).toBeLessThan(0.15);
    expect(crossings).toBeGreaterThanOrEqual(3);
    expect(atRest(state, 0)).toBe(true);
  });

  test("the stretch lets go with at most a small overshoot", () => {
    const { state, trace } = run(STRETCH_SPRING, { value: MAX_STRETCH, velocity: 0 }, 0, 1);
    expect(Math.min(...trace)).toBeGreaterThan(-MAX_STRETCH * 0.25);
    expect(atRest(state, 0)).toBe(true);
  });

  test("a long frame advances the spring as far as many short ones", () => {
    const one = stepSpring({ value: 1, velocity: 0 }, 0, POP_SPRING, 0.05);
    const many = Array.from({ length: 5 }).reduce<SpringState>(
      state => stepSpring(state, 0, POP_SPRING, 0.01),
      { value: 1, velocity: 0 },
    );
    expect(Math.abs(one.value - many.value)).toBeLessThan(0.02);
  });
});
