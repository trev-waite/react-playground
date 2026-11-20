export type Pose = {
  x: number;
  y: number;
  scale: number;
  roll: number;
};

type Letter = { glyph: string; home: Pose; pile: Pose; stack: number };

function letter(glyph: string, x: number, y: number, pile: Pose, stack: number): Letter {
  return { glyph, home: { x, y, scale: 1, roll: 0 }, pile, stack };
}

export const LETTERS = [
  letter("T", -0.72, -0.51, { x: -0.30, y: 0.33, scale: 1.13, roll: -29 }, 8),
  letter("a", -0.18, -0.51, { x: -0.69, y: 0.51, scale: 0.89, roll: 40 }, 4),
  letter("k", 0.30, -0.51, { x: 0.51, y: 0.45, scale: 0.85, roll: 37 }, 3),
  letter("e", 0.76, -0.51, { x: 0.22, y: 0.14, scale: 0.94, roll: -46 }, 5),
  letter("s", -1.12, 0.35, { x: -0.23, y: 0.08, scale: 0.79, roll: 41 }, 1),
  letter("h", -0.63, 0.35, { x: -0.56, y: 0.23, scale: 0.90, roll: -58 }, 2),
  letter("a", -0.13, 0.35, { x: 0.18, y: 0.56, scale: 1.15, roll: 26 }, 10),
  letter("p", 0.36, 0.35, { x: -0.34, y: 0.64, scale: 1.05, roll: 63 }, 6),
  letter("e", 0.85, 0.35, { x: 0.46, y: 0.32, scale: 1.04, roll: -22 }, 7),
  letter(".", 1.21, 0.35, { x: 0.61, y: 0.48, scale: 1.08, roll: -13 }, 9),
] as const;

export const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));

export function flightOrder(count: number, random = Math.random): number[] {
  const ranks = Array.from({ length: count }, (_, index) => index);
  for (let index = count - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [ranks[index], ranks[other]] = [ranks[other]!, ranks[index]!];
  }
  return ranks;
}

export function letterDeparture(rank: number, count: number): number {
  return 0.025 + 0.80 * rank / Math.max(1, count - 1);
}

export const FLIGHT_SPAN = 0.17;

export function followScroll(current: number, target: number, elapsed: number): number {
  const remaining = target - current;
  if (Math.abs(remaining) < 0.0004) return target;
  const maxTravel = 0.00195 * elapsed;
  return current + clamp(remaining * -Math.expm1(-elapsed / 54), -maxTravel, maxTravel);
}

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

export function mixPose(from: Pose, to: Pose, t: number): Pose {
  return {
    x: lerp(from.x, to.x, t),
    y: lerp(from.y, to.y, t),
    scale: lerp(from.scale, to.scale, t),
    roll: lerp(from.roll, to.roll, t),
  };
}

export function flightPose(letter: Letter, progress: number, departure: number): Pose {
  const t = clamp((progress - departure) / FLIGHT_SPAN);
  if (t === 0) return letter.pile;
  if (t === 1) return letter.home;
  const pose = mixPose(letter.pile, letter.home, t * t * (3 - 2 * t));
  const arc = 16 * (t * (1 - t)) ** 2;
  pose.y -= 0.37 * arc;
  pose.scale += 0.13 * arc;
  return pose;
}

const DECAY = 12;
const FREQUENCY = 13.2;
export const SETTLE_MS = 720;

export function springOffset(distance: number, velocity: number, elapsed: number): number {
  if (elapsed >= SETTLE_MS) return 0;
  const seconds = Math.max(0, elapsed) / 1000;
  const angle = FREQUENCY * seconds;
  return Math.exp(-DECAY * seconds) * (
    distance * Math.cos(angle) + (velocity + DECAY * distance) / FREQUENCY * Math.sin(angle)
  );
}

export function liftScale(from: number, resting: number, elapsed: number): number {
  const target = resting * 1.32;
  return target + springOffset(from - target, 0, elapsed * 2.4);
}
