import { DISPLAY_FONT } from "@/live/shared/Stage/tone";

/** Gandalf to Frodo in The Fellowship of the Ring. An empty line is a stanza break. */
export const POEM: readonly string[] = [
  "So do I, and so do all",
  "who live to see such times.",
  "But that is not",
  "for them to decide.",
  "",
  "All we have to decide",
  "is what to do",
  "with the time",
  "that is given us.",
];

/** Line height and margins as shares of the type size. */
const LEADING = 1.32;
const MARGIN = 1.6;
const STANZA = 0.5;

export type PoemLayout = {
  /** Page height over width. */
  aspect: number;
  /** Each line's center, as a share of the page's height from the top. */
  rows: number[];
  size: number;
};

/** Lays the poem out on a page `width` wide, its longest line filling the measure. */
export function layoutPoem(lines: readonly string[], width: number, measure: (text: string, size: number) => number): PoemLayout {
  const longest = Math.max(...lines.map(line => measure(line, 100)));
  const size = (width * 0.84 * 100) / Math.max(1, longest);
  let y = MARGIN * size;
  const centers: number[] = [];
  for (const line of lines) {
    if (line === "") {
      y += STANZA * LEADING * size;
      centers.push(Number.NaN);
      continue;
    }
    centers.push(y + (LEADING * size) / 2);
    y += LEADING * size;
  }
  const height = y + MARGIN * size;
  return { aspect: height / width, rows: centers.map(center => center / height), size };
}

/** Draws the poem white on black for the GPU, returning its layout. */
export function rasterPoem(canvas: HTMLCanvasElement, lines: readonly string[], width: number): PoemLayout {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Focus Pull: 2D canvas unavailable");
  const font = (size: number) => `400 ${size}px ${DISPLAY_FONT}`;
  const layout = layoutPoem(lines, width, (text, size) => {
    context.font = font(size);
    return context.measureText(text).width;
  });
  canvas.width = width;
  canvas.height = Math.round(width * layout.aspect);
  context.fillStyle = "#000";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#fff";
  context.font = font(layout.size);
  context.textBaseline = "middle";
  lines.forEach((line, index) => {
    const row = layout.rows[index]!;
    if (line && Number.isFinite(row)) context.fillText(line, width * 0.08, row * canvas.height);
  });
  return layout;
}
