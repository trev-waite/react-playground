export type CubicBezier = readonly [number, number, number, number];

export const PILL_CLOSED_WIDTH = 78;
export const OPEN_MS = 350;
export const CLOSE_MS = 250;
export const OPEN_EASE: CubicBezier = [0.34, 1.25, 0.64, 1];
export const CLOSE_EASE: CubicBezier = [0.22, 1, 0.36, 1];
export const FADE_IN_MS = 180;
export const FADE_OUT_MS = 90;
const FADE_IN_LEAD_MS = 40;
const MIN_IN_DELAY_MS = 50;

export function cssBezier([x1, y1, x2, y2]: CubicBezier): string {
  return `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;
}

function bezierAxis(p1: number, p2: number, s: number): number {
  const u = 1 - s;
  return 3 * u * u * s * p1 + 3 * u * s * s * p2 + s * s * s;
}

/** The fraction of the duration at which an easing curve first reaches `progress`; overshooting curves count their first crossing. */
export function timeToReach([x1, y1, x2, y2]: CubicBezier, progress: number): number {
  if (progress <= 0) return 0;
  const steps = 64;
  let lo = 0;
  let hi = 1;
  for (let i = 1; i <= steps; i++) {
    const s = i / steps;
    if (bezierAxis(y1, y2, s) >= progress) {
      lo = (i - 1) / steps;
      hi = s;
      break;
    }
  }
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (bezierAxis(y1, y2, mid) >= progress) hi = mid;
    else lo = mid;
  }
  return bezierAxis(x1, x2, hi);
}

/**
 * The pill grows out from its center, so each word fades in as the pill's
 * edge sweeps across its middle, measured from the pill's center. Words
 * already inside the closed pill wait for the trigger dash to slide away.
 */
export function revealDelay(near: number, far: number, openHalfWidth: number): number {
  const closedHalf = PILL_CLOSED_WIDTH / 2;
  const travel = Math.max(1, openHalfWidth - closedHalf);
  const reachedAt = timeToReach(OPEN_EASE, ((near + far) / 2 - closedHalf) / travel) * OPEN_MS;
  return Math.round(Math.max(MIN_IN_DELAY_MS, reachedAt - FADE_IN_LEAD_MS));
}
