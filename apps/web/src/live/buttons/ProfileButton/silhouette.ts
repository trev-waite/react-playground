/** The room's walls: the portrait fades to this at its edge, so it melts into the dark. */
export const ROOM_COLOR = "#000000";

/** The crisp sketch is drawn this small; scaling it up is the blur. */
const SKETCH = 22;
const MIDDLE = 88;

function sketch(ctx: CanvasRenderingContext2D, s: number) {
  const backlight = ctx.createRadialGradient(s * 0.5, s * 0.42, 0, s * 0.5, s * 0.5, s * 0.52);
  backlight.addColorStop(0, "#5b616e");
  backlight.addColorStop(0.5, "#33363e");
  backlight.addColorStop(1, "#16171b");
  ctx.fillStyle = backlight;
  ctx.fillRect(0, 0, s, s);
  const rim = ctx.createRadialGradient(s * 0.5, s * 0.36, 0, s * 0.5, s * 0.36, s * 0.3);
  rim.addColorStop(0, "rgb(92 132 255 / 0.55)");
  rim.addColorStop(1, "rgb(92 132 255 / 0)");
  ctx.fillStyle = rim;
  ctx.fillRect(0, 0, s, s);

  ctx.fillStyle = ROOM_COLOR;
  ctx.beginPath();
  ctx.arc(s * 0.5, s * 0.4, s * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(s * 0.43, s * 0.5);
  ctx.lineTo(s * 0.57, s * 0.5);
  ctx.lineTo(s * 0.58, s * 0.66);
  ctx.bezierCurveTo(s * 0.74, s * 0.68, s * 0.86, s * 0.76, s * 0.9, s * 1.02);
  ctx.lineTo(s * 0.1, s * 1.02);
  ctx.bezierCurveTo(s * 0.14, s * 0.76, s * 0.26, s * 0.68, s * 0.42, s * 0.66);
  ctx.closePath();
  ctx.fill();
}

/**
 * Paints a blurry black silhouette, head and shoulders, against soft graphite
 * light with a faint blue rim behind the head, into
 * a square canvas, fading to ROOM_COLOR at the edge of its circle. The bust is
 * drawn crisp on a tiny canvas and scaled up twice with smoothing, which blurs
 * it the same in every browser, with no filter (Safari's canvas lacks one).
 */
export function paintSilhouette(canvas: HTMLCanvasElement, pixels: number) {
  if (canvas.width !== pixels || canvas.height !== pixels) {
    canvas.width = pixels;
    canvas.height = pixels;
  }
  const ctx = canvas.getContext("2d");
  const small = document.createElement("canvas");
  const middle = document.createElement("canvas");
  small.width = small.height = SKETCH;
  middle.width = middle.height = MIDDLE;
  const smallCtx = small.getContext("2d");
  const middleCtx = middle.getContext("2d");
  if (!ctx || !smallCtx || !middleCtx) return;

  sketch(smallCtx, SKETCH);
  middleCtx.imageSmoothingQuality = "high";
  middleCtx.drawImage(small, 0, 0, MIDDLE, MIDDLE);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(middle, 0, 0, pixels, pixels);

  const vignette = ctx.createRadialGradient(pixels / 2, pixels / 2, 0, pixels / 2, pixels / 2, pixels / 2);
  vignette.addColorStop(0, "rgb(0 0 0 / 0)");
  vignette.addColorStop(0.74, "rgb(0 0 0 / 0)");
  vignette.addColorStop(1, ROOM_COLOR);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, pixels, pixels);
}
