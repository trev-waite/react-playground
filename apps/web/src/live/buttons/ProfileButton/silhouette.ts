/** The room's walls: the portrait fades to this at its edge, so it melts into the dark. */
export const ROOM_COLOR = "#000000";

/** The bust's soft edge, as a share of the picture's width. */
const SOFTNESS = 0.017;

/** Head and shoulders in a square `s` wide: a large head on a neck that flares into sloping shoulders. */
function bust(ctx: CanvasRenderingContext2D, s: number) {
  const at = (x: number, y: number) => [s * x, s * y] as const;
  ctx.beginPath();
  ctx.arc(...at(0.5, 0.385), s * 0.185, 0, Math.PI * 2);
  ctx.moveTo(...at(0.06, 1.04));
  ctx.bezierCurveTo(...at(0.08, 0.8), ...at(0.24, 0.7), ...at(0.4, 0.68));
  ctx.bezierCurveTo(...at(0.43, 0.675), ...at(0.44, 0.62), ...at(0.44, 0.54));
  ctx.lineTo(...at(0.56, 0.54));
  ctx.bezierCurveTo(...at(0.56, 0.62), ...at(0.57, 0.675), ...at(0.6, 0.68));
  ctx.bezierCurveTo(...at(0.76, 0.7), ...at(0.92, 0.8), ...at(0.94, 1.04));
  ctx.closePath();
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
  ctx.translate(-pixels * 2, 0);
  ctx.shadowOffsetX = pixels * 2;
  ctx.shadowBlur = pixels * SOFTNESS * 2;
  ctx.shadowColor = ROOM_COLOR;
  ctx.fillStyle = ROOM_COLOR;
  bust(ctx, pixels);
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
