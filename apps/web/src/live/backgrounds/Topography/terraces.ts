/** The relief's shape: how many terraces, how high, how far each lifts, and the camera's perspective. */

/** Terraces stacked into the relief, lowest first. */
export const LAYERS = 11;
/** Height of the lowest terrace and the step between terraces, on terrain that runs 0 to 1. */
export const BASE_LEVEL = 0.16;
export const LEVEL_STEP = 0.074;
/** How far one terrace lifts above the next, as a fraction of the stage height, in the foreground. */
export const LIFT = 0.0135;
/** The heightmap is sampled at this fraction of the canvas size; bilinear taps smooth it back up. */
export const HEIGHTMAP_SCALE = 1 / 2;

/**
 * The heightmap runs past the bottom of the stage by the tallest lift, so a
 * terrace lifted from below the bottom edge still has ground to show.
 */
export const EXTENT = 1 + LIFT * LAYERS + 0.02;

export function levelOf(layer: number): number {
  return BASE_LEVEL + layer * LEVEL_STEP;
}

/** How far above the stage's top edge the horizon sits, in stage heights. Nearer means a steeper perspective. */
export const HORIZON = 0.6;

/**
 * How much nearer a row of the stage is than the far edge, for a ground plane
 * seen from a tilted camera: 1 at the bottom, shrinking toward the top, so
 * terrain far away is smaller and its terraces lift less.
 */
export function nearness(y: number): number {
  return (y + HORIZON) / (1 + HORIZON);
}
