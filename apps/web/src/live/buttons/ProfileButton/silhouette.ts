/** The room's walls: the portrait fades to this at its edge, so it melts into the dark. */
export const ROOM_COLOR = "#000000";

/** The bust's soft edge, as a share of the picture's width. */
const SOFTNESS = 0.017;

type Point = readonly [number, number];
type Curve = readonly [Point, Point, Point];

/**
 * Traces a shape that is the same on both sides of the picture's middle: its
 * right half runs from `from` on the middle line through `curves` (two
 * controls and an end each) back to the middle line, and is drawn mirrored too.
 */
function mirrored(ctx: CanvasRenderingContext2D, s: number, shift: number, from: Point, curves: readonly Curve[]) {
  for (const flip of [1, -1]) {
    const at = ([x, y]: Point) => [s * (0.5 + (x - 0.5) * flip) + shift, s * y] as const;
    ctx.moveTo(...at(from));
    for (const [c1, c2, end] of curves) ctx.bezierCurveTo(...at(c1), ...at(c2), ...at(end));
    ctx.closePath();
  }
}

/**
 * Head and shoulders in a square `s` wide, `shift` along: an oval head that
 * narrows to the jaw, a short neck, and shoulders that slope down from it and
 * round over at the arms.
 */
function bust(ctx: CanvasRenderingContext2D, s: number, shift: number) {
  ctx.beginPath();
  mirrored(ctx, s, shift, [0.5, 0.17], [
    [[0.6, 0.17], [0.655, 0.25], [0.655, 0.35]],
    [[0.655, 0.45], [0.6, 0.545], [0.5, 0.555]],
  ]);
  mirrored(ctx, s, shift, [0.5, 0.48], [
    [[0.56, 0.48], [0.585, 0.48], [0.585, 0.5]],
    [[0.585, 0.59], [0.6, 0.64], [0.66, 0.665]],
    [[0.74, 0.69], [0.8, 0.71], [0.845, 0.745]],
    [[0.905, 0.79], [0.935, 0.89], [0.945, 1.04]],
    [[0.945, 1.04], [0.5, 1.04], [0.5, 1.04]],
  ]);
  ctx.fill();
}

/**
 * Paints a soft black silhouette, head and shoulders, against a white light
 * behind the head, into a square canvas `pixels` wide, fading to ROOM_COLOR
 * at the edge of its circle. The bust is drawn off the canvas and only its
 * shadow lands on it, which blurs it smoothly at full resolution in every
 * browser, with no filter (Safari's canvas lacks one).
 */
export function paintSilhouette(canvas: HTMLCanvasElement, pixels: number) {
  if (canvas.width !== pixels || canvas.height !== pixels) {
    canvas.width = pixels;
    canvas.height = pixels;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const backlight = ctx.createRadialGradient(pixels * 0.5, pixels * 0.36, 0, pixels * 0.5, pixels * 0.42, pixels * 0.62);
  backlight.addColorStop(0, "#f4f4f4");
  backlight.addColorStop(0.4, "#d2d2d2");
  backlight.addColorStop(1, "#808080");
  ctx.fillStyle = backlight;
  ctx.fillRect(0, 0, pixels, pixels);

  ctx.save();
  ctx.shadowOffsetX = pixels * 2;
  ctx.shadowBlur = pixels * SOFTNESS * 2;
  ctx.shadowColor = ROOM_COLOR;
  ctx.fillStyle = ROOM_COLOR;
  bust(ctx, pixels, -pixels * 2);
  ctx.restore();

  const vignette = ctx.createRadialGradient(pixels / 2, pixels / 2, 0, pixels / 2, pixels / 2, pixels / 2);
  vignette.addColorStop(0, "rgb(0 0 0 / 0)");
  for (const [stop, alpha] of [[0.55, 0], [0.7, 0.08], [0.8, 0.24], [0.9, 0.58], [0.96, 0.86]] as const) {
    vignette.addColorStop(stop, `rgb(0 0 0 / ${alpha})`);
  }
  vignette.addColorStop(1, ROOM_COLOR);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, pixels, pixels);
}
