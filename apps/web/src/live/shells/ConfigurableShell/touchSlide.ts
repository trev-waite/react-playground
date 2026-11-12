/**
 * How far a finger travels before a slider decides between sliding and
 * leaving the swipe to the page. It sits under Safari's own pan slop, so the
 * slider claims a slide before Safari starts scrolling.
 */
export const TOUCH_SLOP = 6;

export type TouchIntent = "slide" | "scroll";

/** A finger past the slop slides when it moved more across than down; otherwise the page scrolls. */
export function touchIntent(dx: number, dy: number): TouchIntent | null {
  if (Math.hypot(dx, dy) < TOUCH_SLOP) return null;
  return Math.abs(dx) > Math.abs(dy) ? "slide" : "scroll";
}
