/**
 * Procedural 45° diagonal-band dissolve.
 * Progress 0 = Live fully covering; 1 = Experimental fully revealed.
 * Bands travel up-and-right: bottom-left opens first, top-right last.
 */

export const DEFAULT_BAND_COUNT = 12;
export const DEFAULT_DURATION_MS = 720;
export const REDUCED_MOTION_MS = 180;
/** Matches ConfigurableShell --cs-ease */
export const BAND_EASE = "cubic-bezier(0.23, 1, 0.32, 1)";

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * Whether band index `i` (0 … bandCount-1) has opened to reveal Experimental.
 * Lower indices sit toward bottom-left of a 45° gradient.
 */
export function isBandRevealed(
  bandIndex: number,
  progress: number,
  bandCount: number = DEFAULT_BAND_COUNT,
): boolean {
  if (bandCount <= 0) return progress >= 1;
  const p = clamp01(progress);
  // Open band i once progress crosses the end of that stripe.
  return (bandIndex + 1) / bandCount <= p + Number.EPSILON;
}

/**
 * Luminance/alpha mask as a CSS linear-gradient at geometric 45°.
 * Opaque white = Live visible; transparent = see through to Experimental.
 * Uses alpha (not black/white luminance) for broad mask-image support.
 */
export function bandMaskGradient(
  progress: number,
  bandCount: number = DEFAULT_BAND_COUNT,
): string {
  const count = Math.max(1, Math.round(bandCount));
  const p = clamp01(progress);
  const stops: string[] = [];

  for (let i = 0; i < count; i++) {
    const start = (i / count) * 100;
    const end = ((i + 1) / count) * 100;
    const color = isBandRevealed(i, p, count) ? "transparent" : "#fff";
    stops.push(`${color} ${start}%`, `${color} ${end}%`);
  }

  // 45deg: 0% toward bottom-left, 100% toward top-right (up-and-right travel).
  return `linear-gradient(45deg, ${stops.join(", ")})`;
}

/**
 * Frost strength on the Experimental layer (0–1). Peaks mid-transition,
 * clears as Experimental comes into focus.
 */
export function frostStrength(progress: number): number {
  const p = clamp01(progress);
  if (p <= 0 || p >= 1) return 0;
  return Math.sin(p * Math.PI);
}
