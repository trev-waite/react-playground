type GlyphArt = { width: number; height: number; outline: string; side: string; left: number; top: number };

const PIXELS_PER_EM = 384;
const DEPTH_X = 24;
const DEPTH_Y = -14;
const artwork = new Map<string, GlyphArt>();

export function outlineFromAlpha({ data, width, height }: Pick<ImageData, "data" | "width" | "height">) {
  const opaque = (x: number, y: number) =>
    x >= 0 && x < width && y >= 0 && y < height && data[(y * width + x) * 4 + 3]! >= 16;
  const stride = width + 1;
  const edges = new Map<number, number[]>();
  const steps = [1, stride, -1, -stride];
  const vertex = (point: number) => `${point % stride} ${Math.floor(point / stride)}`;

  function addEdge(from: number, to: number) {
    const outgoing = edges.get(from);
    if (outgoing) outgoing.push(to);
    else edges.set(from, [to]);
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!opaque(x, y)) continue;
      const topLeft = y * stride + x;
      const bottomLeft = topLeft + stride;
      if (!opaque(x, y - 1)) addEdge(topLeft, topLeft + 1);
      if (!opaque(x + 1, y)) addEdge(topLeft + 1, bottomLeft + 1);
      if (!opaque(x, y + 1)) addEdge(bottomLeft + 1, bottomLeft);
      if (!opaque(x - 1, y)) addEdge(bottomLeft, topLeft);
    }
  }

  let outline = "";
  while (edges.size) {
    const start = edges.keys().next().value!;
    let from = start;
    let previousStep = 0;
    outline += `M${vertex(start)}`;
    do {
      const outgoing = edges.get(from)!;
      let edgeIndex = 0;
      if (outgoing.length > 1) {
        const rightTurn = steps[(steps.indexOf(previousStep) + 1) % steps.length]!;
        if (outgoing[1] === from + rightTurn) edgeIndex = 1;
      }
      const to = outgoing[edgeIndex]!;
      outgoing.splice(edgeIndex, 1);
      if (!outgoing.length) edges.delete(from);

      const step = to - from;
      if (previousStep && step !== previousStep) outline += `L${vertex(from)}`;
      previousStep = step;
      from = to;
    } while (from !== start);
    outline += "Z";
  }

  return outline;
}

function artworkFor(glyph: string, font: string) {
  const key = `${font}:${glyph}`;
  const cached = artwork.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.font = font;
  const metrics = context.measureText(glyph);
  const left = Math.floor(-metrics.actualBoundingBoxLeft) - 1;
  const top = Math.floor(-metrics.actualBoundingBoxAscent) + DEPTH_Y - 1;
  canvas.width = Math.ceil(metrics.actualBoundingBoxRight) - left + DEPTH_X + 2;
  canvas.height = Math.ceil(metrics.actualBoundingBoxDescent) - top + 2;
  context.font = font;
  context.fillText(glyph, -left, -top);

  const outline = outlineFromAlpha(context.getImageData(0, 0, canvas.width, canvas.height));
  for (let x = 1; x <= DEPTH_X; x++) {
    context.fillText(glyph, x - left, x * DEPTH_Y / DEPTH_X - top);
  }
  const side = outlineFromAlpha(context.getImageData(0, 0, canvas.width, canvas.height));
  const art = { width: canvas.width, height: canvas.height, outline, side, left, top };
  artwork.set(key, art);
  return art;
}

export function prepareGlyphArt(button: HTMLButtonElement, glyph: string, fontFamily: string) {
  const art = button.querySelector<SVGSVGElement>("[data-glyph-art]")!;
  const shape = artworkFor(glyph, `400 ${PIXELS_PER_EM}px ${fontFamily}`);
  if (!shape) return;
  const { left, top, width, height } = shape;
  const em = (pixels: number) => `${pixels / PIXELS_PER_EM}em`;
  art.style.left = em(left);
  art.style.top = em(top);
  art.style.width = em(width);
  art.style.height = em(height);
  art.setAttribute("viewBox", `0 0 ${width} ${height}`);
  const [side, face] = Array.from(art.querySelectorAll("path"));
  side!.setAttribute("d", shape.side);
  face!.setAttribute("d", shape.outline);
  button.setAttribute("data-art-ready", "");
}
