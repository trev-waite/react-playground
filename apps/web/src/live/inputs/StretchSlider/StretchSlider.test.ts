import { describe, expect, test } from "bun:test";
import {
  MAX_STRETCH,
  POP_KICK,
  POP_SPRING,
  STRETCH_SPRING,
  atRest,
  fills,
  keyValue,
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
