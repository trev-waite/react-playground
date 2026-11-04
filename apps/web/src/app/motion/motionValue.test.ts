import { describe, expect, test } from "bun:test";
import { frame } from "./frameLoop";
import { animate, MotionValue, type Animation } from "./motionValue";
import reference from "./motionReference.json";
import { REDUCED_MOTION, SPRING, type Transition } from "./transitions";

/**
 * `motionReference.json` was recorded from Motion 13.1.1 before it was
 * removed: each case drove Motion's `animate()` on a fake clock, frame by
 * frame, and logged every value, `onUpdate`, and when each animation settled.
 * Replaying the same steps here must reproduce those traces.
 */

type Step = {
  frame: number;
  at: "between" | "inFrame";
  op: "animate" | "jump" | "stop" | "animateNumber";
  value?: string;
  to?: number;
  from?: number;
  transition?: string;
  id?: string;
};
type Case = {
  name: string;
  base: number;
  frames: number;
  values: Record<string, number>;
  steps: Step[];
  expected: {
    values: Record<string, number[]>;
    updates: Record<string, number[]>;
    finished: Record<string, number>;
    completed: Record<string, number>;
  };
};

/** Relative; the fixture stores 15 significant digits. */
const TOLERANCE = 1e-12;

const TRANSITIONS: Record<string, Transition> = {
  ...SPRING,
  reduced: REDUCED_MOTION,
  instant: { duration: 0 },
  dissolve: { duration: 0.72, ease: t => 1 - Math.pow(1 - t, 3.2) },
  dissolveReduced: { duration: 0.18, ease: "linear" },
};

let clock = 0;
let frames: FrameRequestCallback[] = [];
Object.defineProperty(performance, "now", { value: () => clock, configurable: true });
globalThis.requestAnimationFrame = callback => frames.push(callback);

const flush = () => new Promise(resolve => setImmediate(resolve));

async function replay(c: Case) {
  frames = [];
  clock = c.base;
  const frameTime = (k: number) => c.base + k * reference.frame;
  const values = Object.fromEntries(Object.entries(c.values).map(([name, init]) => [name, new MotionValue(init)]));
  await flush();
  const animations: Record<string, Animation> = {};
  const lastUpdate: Record<string, number | null> = {};
  const actual: Case["expected"] = {
    values: Object.fromEntries(Object.keys(c.values).map(name => [name, []])),
    updates: {},
    finished: {},
    completed: {},
  };
  let stamp = 0;

  const execute = (step: Step) => {
    const id = step.id!;
    if (step.op === "animate") {
      animations[id] = animate(values[step.value!]!, step.to!, TRANSITIONS[step.transition!]!);
      void animations[id].finished.then(() => (actual.finished[id] ??= stamp));
    } else if (step.op === "jump") {
      values[step.value!]!.jump(step.to!);
    } else if (step.op === "stop") {
      animations[id]!.stop();
    } else {
      actual.updates[id] = [];
      lastUpdate[id] = null;
      animations[id] = animate(step.from!, step.to!, {
        ...TRANSITIONS[step.transition!]!,
        onUpdate: value => (lastUpdate[id] = value),
        onComplete: () => (actual.completed[id] ??= stamp),
      });
    }
  };

  for (let k = 0; k < c.frames; k++) {
    clock = frameTime(k) - reference.between;
    stamp = k - 0.5;
    for (const step of c.steps.filter(s => s.frame === k)) {
      if (step.at === "between") execute(step);
      else frame.update(() => execute(step));
    }
    await flush();
    clock = frameTime(k);
    stamp = k;
    for (const callback of frames.splice(0)) callback(clock);
    await flush();
    for (const name of Object.keys(c.values)) actual.values[name]!.push(values[name]!.get());
    for (const id of Object.keys(actual.updates)) actual.updates[id]!.push(lastUpdate[id] as number);
  }
  return actual;
}

function expectClose(actual: number[], expected: number[], label: string) {
  expect(actual.length).toBe(expected.length);
  const worst = actual.reduce((max, value, i) => {
    const target = expected[i]!;
    const error = Math.abs(value - target) / Math.max(1, Math.abs(target));
    return Math.max(max, error);
  }, 0);
  if (worst > TOLERANCE) {
    const first = actual.findIndex((value, i) => Math.abs(value - expected[i]!) / Math.max(1, Math.abs(expected[i]!)) > TOLERANCE);
    throw new Error(`${label}: frame ${first} is ${actual[first]}, Motion had ${expected[first]}`);
  }
}

describe("motion values replay Motion 13's traces", () => {
  for (const c of reference.cases as unknown as Case[]) {
    test(c.name, async () => {
      const actual = await replay(c);
      for (const [name, trace] of Object.entries(c.expected.values)) expectClose(actual.values[name]!, trace, name);
      for (const [id, trace] of Object.entries(c.expected.updates)) expectClose(actual.updates[id]!, trace, id);
      expect(actual.finished).toEqual(c.expected.finished);
      expect(actual.completed).toEqual(c.expected.completed);
    });
  }
});
