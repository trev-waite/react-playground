// Heights are measured from the track floor; clockwise paths fill overlapping pieces as a union.

export type Spring = { value: number; velocity: number };

export type Zone = { left: number; right: number; bottom: number; top: number };

/** A bar's lower piece runs from the floor to `lower`; its upper piece from `gapTop` to `top`. */
export type BarTargets = { lower: number; gapTop: number; top: number };

export const PINCH_DISTANCE = 6;
export const SNAP_DISTANCE = 1.2;
const MIN_UPPER = 3;
const MAX_BULGE = 0.45;

export function spring(value: number): Spring {
  return { value, velocity: 0 };
}

export function stepSpring(
  state: Spring,
  target: number,
  stiffness: number,
  dampingRatio: number,
  dt: number,
) {
  const damping = 2 * dampingRatio * Math.sqrt(stiffness);
  // Small integration steps keep stiff springs stable after a dropped frame.
  const steps = Math.max(1, Math.ceil(dt * 120));
  const interval = dt / steps;
  for (let i = 0; i < steps; i++) {
    state.velocity += ((target - state.value) * stiffness - state.velocity * damping) * interval;
    state.value += state.velocity * interval;
  }
}

export const isSettled = (state: Spring, target: number) =>
  Math.abs(state.value - target) < 0.01 && Math.abs(state.velocity) < 0.05;

export function barTargets(height: number, zone?: Zone): BarTargets {
  if (!zone || height <= zone.bottom) return { lower: height, gapTop: height, top: height };
  if (height <= zone.top + MIN_UPPER) return { lower: zone.bottom, gapTop: zone.bottom, top: zone.bottom };
  return { lower: zone.bottom, gapTop: zone.top, top: height };
}

export const overlapsZone = (cx: number, radius: number, zone: Zone) =>
  cx + radius > zone.left && cx - radius < zone.right;

/** Necks hold until stretched past the pinch distance, and only re-form on near contact. */
export function stillConnected(connected: boolean, gap: number) {
  return connected ? gap < PINCH_DISTANCE : gap < SNAP_DISTANCE;
}

/** Half-width of a neck: full while touching, thinning as it stretches, bulging while pieces overlap. */
export function neckWaist(gap: number, radius: number) {
  if (radius <= 0) return 0;
  if (gap <= 0) return radius * (1 + Math.min(MAX_BULGE, -gap / (4 * radius)));
  return radius * Math.max(0, 1 - gap / PINCH_DISTANCE) ** 0.8;
}

const fmt = (n: number) => n.toFixed(2);

/** A vertical stadium from `bottom` to `top`, shrinking to a dot and then nothing when short. */
export function capsule(cx: number, bottom: number, top: number, radius: number, height: number) {
  const length = top - bottom;
  if (length <= 0.05 || radius <= 0) return "";
  const r = Math.min(radius, length / 2);
  const yTop = height - top + r;
  const yBottom = height - bottom - r;
  return (
    `M${fmt(cx - r)} ${fmt(yBottom)}V${fmt(yTop)}` +
    `A${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(cx + r)} ${fmt(yTop)}V${fmt(yBottom)}` +
    `A${fmt(r)} ${fmt(r)} 0 0 1 ${fmt(cx - r)} ${fmt(yBottom)}Z`
  );
}

type NeckEnd = { x: number; y: number; radius: number };

// Vertical tangents at both ends keep the bridge smooth as its waist pinches.
export function neck(from: NeckEnd, to: NeckEnd, waist: number, height: number) {
  if (waist <= 0.04) return "";
  const y0 = height - from.y;
  const y1 = height - to.y;
  const mx = (from.x + to.x) / 2;
  const my = (y0 + y1) / 2;
  const pull = (y0 - y1) * 0.28;
  const side = (sign: -1 | 1, start: NeckEnd, startY: number, end: NeckEnd, endY: number) => {
    const sx = start.x + sign * start.radius;
    const ex = end.x + sign * end.radius;
    const wx = mx + sign * waist;
    const toward = Math.sign(endY - startY) * Math.abs(pull);
    return (
      `C${fmt(sx)} ${fmt(startY + toward)} ${fmt(wx)} ${fmt(my - toward)} ${fmt(wx)} ${fmt(my)}` +
      `C${fmt(wx)} ${fmt(my + toward)} ${fmt(ex)} ${fmt(endY - toward)} ${fmt(ex)} ${fmt(endY)}`
    );
  };
  return (
    `M${fmt(from.x - from.radius)} ${fmt(y0)}` +
    side(-1, from, y0, to, y1) +
    `L${fmt(to.x + to.radius)} ${fmt(y1)}` +
    side(1, to, y1, from, y0) +
    "Z"
  );
}
