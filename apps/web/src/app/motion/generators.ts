import type { Easing, SpringTransition, Transition, TweenTransition } from "./transitions";

/**
 * A curve from one value to another, sampled by elapsed milliseconds. The
 * math is a line-for-line port of Motion 13's generators, so springs keep the
 * exact shape, rest thresholds, and settle time they had under Motion.
 */
export type Generator = {
  /** When the animation lands, in ms. */
  duration: number;
  value: (elapsed: number) => number;
};

type Sample = { value: number; done: boolean };

const REST = {
  granular: { speed: 0.01, delta: 0.005 },
  standard: { speed: 2, delta: 0.5 },
};
const DURATION_STEP = 50;
const MAX_DURATION = 20000;

export function isSpring(transition: Transition): transition is SpringTransition {
  return "type" in transition && transition.type === "spring";
}

function clamp(min: number, max: number, value: number): number {
  return value > max ? max : value < min ? min : value;
}

export function mixNumber(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

/** Springs only report rest; the landing time is the first 50 ms step at rest. */
function settleTime(sample: (elapsed: number) => Sample): number {
  let duration = 0;
  let state = sample(duration);
  while (!state.done && duration < MAX_DURATION) {
    duration += DURATION_STEP;
    state = sample(duration);
  }
  return duration >= MAX_DURATION ? Infinity : duration;
}

/** `velocity` is in units per second; springs set by feel ignore it, as Motion does. */
export function springGenerator(
  from: number,
  to: number,
  transition: SpringTransition,
  velocity: number,
): Generator {
  let stiffness: number;
  let damping: number;
  let mass: number;
  let initialVelocity: number;
  if ("visualDuration" in transition) {
    const root = (2 * Math.PI) / (transition.visualDuration * 1.2);
    stiffness = root * root;
    damping = 2 * clamp(0.05, 1, 1 - (transition.bounce || 0)) * Math.sqrt(stiffness);
    mass = 1;
    initialVelocity = 0;
  } else {
    ({ stiffness, damping, mass } = transition);
    initialVelocity = -(velocity / 1000) || 0;
  }

  const dampingRatio = damping / (2 * Math.sqrt(stiffness * mass));
  const initialDelta = to - from;
  const undampedAngularFreq = Math.sqrt(stiffness / mass) / 1000;
  const rest = Math.abs(initialDelta) < 5 ? REST.granular : REST.standard;

  let position: (t: number) => number;
  let speed: (t: number) => number;
  if (dampingRatio < 1) {
    const angularFreq = undampedAngularFreq * Math.sqrt(1 - dampingRatio * dampingRatio);
    const A = (initialVelocity + dampingRatio * undampedAngularFreq * initialDelta) / angularFreq;
    const sinCoeff = dampingRatio * undampedAngularFreq * A + initialDelta * angularFreq;
    const cosCoeff = dampingRatio * undampedAngularFreq * initialDelta - A * angularFreq;
    position = t => {
      const envelope = Math.exp(-dampingRatio * undampedAngularFreq * t);
      return to - envelope * (A * Math.sin(angularFreq * t) + initialDelta * Math.cos(angularFreq * t));
    };
    speed = t => {
      const envelope = Math.exp(-dampingRatio * undampedAngularFreq * t);
      return envelope * (sinCoeff * Math.sin(angularFreq * t) + cosCoeff * Math.cos(angularFreq * t));
    };
  } else if (dampingRatio === 1) {
    const C = initialVelocity + undampedAngularFreq * initialDelta;
    position = t =>
      to - Math.exp(-undampedAngularFreq * t) * (initialDelta + (initialVelocity + undampedAngularFreq * initialDelta) * t);
    speed = t => Math.exp(-undampedAngularFreq * t) * (undampedAngularFreq * C * t - initialVelocity);
  } else {
    const dampedAngularFreq = undampedAngularFreq * Math.sqrt(dampingRatio * dampingRatio - 1);
    const P = (initialVelocity + dampingRatio * undampedAngularFreq * initialDelta) / dampedAngularFreq;
    const sinhCoeff = dampingRatio * undampedAngularFreq * P - initialDelta * dampedAngularFreq;
    const coshCoeff = dampingRatio * undampedAngularFreq * initialDelta - P * dampedAngularFreq;
    position = t => {
      const envelope = Math.exp(-dampingRatio * undampedAngularFreq * t);
      const freqForT = Math.min(dampedAngularFreq * t, 300);
      return (
        to -
        (envelope *
          ((initialVelocity + dampingRatio * undampedAngularFreq * initialDelta) * Math.sinh(freqForT) +
            dampedAngularFreq * initialDelta * Math.cosh(freqForT))) /
          dampedAngularFreq
      );
    };
    speed = t => {
      const envelope = Math.exp(-dampingRatio * undampedAngularFreq * t);
      const freqForT = Math.min(dampedAngularFreq * t, 300);
      return envelope * (sinhCoeff * Math.sinh(freqForT) + coshCoeff * Math.cosh(freqForT));
    };
  }

  const sample = (t: number): Sample => {
    const current = position(t);
    const done = Math.abs(speed(t) * 1000) <= rest.speed && Math.abs(to - current) <= rest.delta;
    return { value: done ? to : current, done };
  };
  return { duration: settleTime(sample), value: t => sample(t).value };
}

function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const calcBezier = (t: number, a1: number, a2: number) =>
    (((1.0 - 3.0 * a2 + 3.0 * a1) * t + (3.0 * a2 - 6.0 * a1)) * t + 3.0 * a1) * t;
  const tForX = (x: number) => {
    let lower = 0;
    let upper = 1;
    let currentX: number;
    let currentT: number;
    let i = 0;
    do {
      currentT = lower + (upper - lower) / 2.0;
      currentX = calcBezier(currentT, x1, x2) - x;
      if (currentX > 0.0) upper = currentT;
      else lower = currentT;
    } while (Math.abs(currentX) > 0.0000001 && ++i < 12);
    return currentT;
  };
  return t => (t === 0 || t === 1 ? t : calcBezier(tForX(t), y1, y2));
}

const easeOut = cubicBezier(0, 0, 0.58, 1);

function easingFunction(ease: Easing): (progress: number) => number {
  if (ease === "linear") return progress => progress;
  if (ease === "easeOut") return easeOut;
  return ease;
}

export function tweenGenerator(from: number, to: number, transition: TweenTransition): Generator {
  const duration = transition.duration * 1000;
  const ease = easingFunction(transition.ease ?? "easeOut");
  return {
    duration,
    value: elapsed => {
      if (from === to) return to;
      const progress = duration ? clamp(0, duration, elapsed) / duration : 1;
      return mixNumber(from, to, ease(progress));
    },
  };
}
