/** The word's type size, as shares of the stage's height and width, and the share of the width it may span. */
const TYPE_HEIGHT = 0.62;
const TYPE_WIDTH = 0.34;
const FIT_WIDTH = 0.78;
/** The pressed word's texture, in type sizes: its height, and the room each side of the word for its soft shoulders. */
export const MASK_HEIGHT = 1.6;
const MASK_SIDE = 0.35;
/** Keeps a full-screen texture near 16 MB, well inside WebGPU's 8192 limit. */
const MAX_MASK_SIDE = 4096;

/** The type size the word takes on a stage this size, given its width per pixel of type size. */
export function typeSize(width: number, height: number, ratio: number): number {
  const size = Math.min(height * TYPE_HEIGHT, width * TYPE_WIDTH);
  return size * Math.min(1, (width * FIT_WIDTH) / Math.max(1e-6, ratio * size));
}

function maskShape(ratio: number): [across: number, tall: number] {
  return [ratio + MASK_SIDE * 2, MASK_HEIGHT];
}

/**
 * Where the word's texture lies on a stage this size, in the stage's 0–1 coordinates (x, y, width,
 * height): centered, its middle just above the stage's. One texture serves every size, so the word
 * keeps its shape while a card zooms and never waits on a new press.
 */
export function wordPlacement(width: number, height: number, ratio: number): [number, number, number, number] {
  const size = typeSize(width, height, ratio);
  const [across, tall] = maskShape(ratio);
  const w = (across * size) / Math.max(1, width);
  const h = (tall * size) / Math.max(1, height);
  return [0.5 - w / 2, 0.49 - 0.49 * h, w, h];
}

/** Texture size for the largest the word gets on this screen, so a smaller stage only samples it down. */
export function maskSize(ratio: number, viewport: readonly [number, number], dpr: number): [number, number] {
  const [across, tall] = maskShape(ratio);
  const size = typeSize(viewport[0], viewport[1], ratio) * dpr;
  const shrink = Math.min(1, MAX_MASK_SIDE / (Math.max(across, tall) * size));
  return [Math.max(1, Math.round(across * size * shrink)), Math.max(1, Math.round(tall * size * shrink))];
}
