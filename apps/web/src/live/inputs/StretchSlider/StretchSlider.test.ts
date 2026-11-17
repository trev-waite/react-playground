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
  layoutX,
  lineFraction,
  lineX,
  fillFor,
  MIN_FILL,
  HANDLE_INSET,
  CALM_SPEED,
  FOLLOW_SPRING,
  HANDLE_HEIGHT,
  PARK_GAP,
  halfLength,
  parkedX,
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

  test("puts the line under the pointer on one even scale, 0 at the very left, and clamps past either end", () => {
    const width = 300;
    const parked = 6.75;
    for (const fraction of [0, 0.01, 0.25, 0.5, 1]) expect(lineFraction(lineX(fraction, parked, width), parked, width)).toBeCloseTo(fraction);
    expect(lineX(0, parked, width)).toBe(parked);
    expect(lineX(1, parked, width)).toBe(width - HANDLE_INSET);
    const percent = (at: number) => lineX(at + 0.01, parked, width) - lineX(at, parked, width);
    for (const at of [0, 0.05, 0.5, 0.98]) expect(percent(at)).toBeCloseTo(percent(0.5));
    expect(lineFraction(-40, parked, width)).toBe(0);
    expect(lineFraction(900, parked, width)).toBe(1);
  });

  test("reads the pointer in layout px when the deck draws the slider scaled down", () => {
    const width = 360;
    const scale = 0.75;
    const end = 10 + lineX(1, 6.75, width);
    const onScreen = 100 + end * scale;
    expect(lineFraction(layoutX(onScreen, 100, width * scale, width) - 10, 6.75, width)).toBeCloseTo(1);
    expect(layoutX(140, 100, 0, 0)).toBe(40);
  });

  test("the grey rides just past the line, keeps room for the number, then slides away to nothing at 0", () => {
    const width = 300;
    const parked = 6.75;
    const edge = (x: number) => width + fillFor(x, parked, width).offset;
    expect(edge(lineX(1, parked, width))).toBe(width);
    expect(edge(150)).toBe(150 + HANDLE_INSET);
    expect(edge(MIN_FILL - HANDLE_INSET)).toBe(MIN_FILL);
    expect(edge(MIN_FILL - HANDLE_INSET - 0.01)).toBeCloseTo(MIN_FILL, 1);
    expect(fillFor(150, parked, width).opacity).toBe(1);
    expect(fillFor(parked, parked, width).opacity).toBe(0);
    expect(edge(parked)).toBe(0);
    let last = edge(MIN_FILL - HANDLE_INSET);
    for (let x = MIN_FILL - HANDLE_INSET; x >= parked; x -= 0.5) {
      expect(edge(x)).toBeLessThanOrEqual(last + 1e-9);
      last = edge(x);
    }
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

  test("the line is whole at 0 and well clear of the number, and parted wherever it would cross it", () => {
    for (const digits of [1, 2, 3]) {
      const number = box(digits);
      const parked = parkedX(number, width);
      expect(splitAt(parked, parked, number, width)).toBe(0);
      expect(splitAt(number.right + width / 2 + 1 + 14, parked, number, width)).toBe(0);
      expect(splitAt(number.right + 60, parked, number, width)).toBe(0);
      for (let x = number.left - width / 2; x <= number.right + width / 2; x += 0.5) expect(splitAt(x, parked, number, width)).toBe(1);
    }
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

  test("as the line moves, its halves part and close smoothly, never jumping ahead of it", () => {
    const number = box(1);
    const parked = parkedX(number, width);
    let last = topHalf(splitAt(parked, parked, number, width), channel, number).y;
    let steepest = 0;
    for (let x = parked + 0.25; x <= 120; x += 0.25) {
      const y = topHalf(splitAt(x, parked, number, width), channel, number).y;
      steepest = Math.max(steepest, Math.abs(y - last) / 0.25);
      last = y;
    }
    expect(steepest).toBeLessThan(2.5);
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
