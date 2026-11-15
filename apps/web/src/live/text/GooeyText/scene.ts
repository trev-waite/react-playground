import { DROP_RADIUS, PARK_GAP, RIDE_HEIGHT, layoutWord, type WordLayout } from "./timeline";

/** Layout units: the font is set at this size and the line scales to fit. */
export const FONT_SIZE = 100;
export const fontAt = (size: number) => `720 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
export const FONT = fontAt(FONT_SIZE);
export const BASELINE = FONT_SIZE * 0.95;
/** The line the drop rides, through the middle of the lowercase letters. */
export const DROP_Y = BASELINE - FONT_SIZE * RIDE_HEIGHT;
export const HEIGHT = FONT_SIZE * 1.3;
export const DROP_SIZE = FONT_SIZE * DROP_RADIUS;
/** How far the goo is blurred before its edge is cut back to a hard line. */
export const GOO_BLUR = FONT_SIZE * 0.037;
/** The SVG goo's alpha after the blur is `GOO_GAIN * alpha - GOO_CUT`. */
export const GOO_GAIN = 40;
export const GOO_CUT = 18;
/** Where that cut crosses half alpha: the GPU goo draws its edge at this blurred alpha. */
export const GOO_EDGE = (GOO_CUT + 0.5) / GOO_GAIN;
/** Room around the line for goo that spills past it: a blooming descender, the blur's fringe. */
export const SPILL_X = FONT_SIZE * 0.1;
export const SPILL_Y = FONT_SIZE * 0.2;
/** Room between letters, so the goo joins a letter to the drop but not to its neighbors. */
const TRACKING = FONT_SIZE * 0.05;

export type Lines = { words: WordLayout[]; width: number };

export function measureLines(words: readonly string[]): Lines {
  const context = document.createElement("canvas").getContext("2d");
  const measure = (text: string) => {
    if (!context) return text.length * FONT_SIZE * 0.6;
    context.font = FONT;
    return context.measureText(text).width;
  };
  const tracked = (text: string) => measure(text) + [...text].length * TRACKING;
  const widest = Math.max(...words.map(tracked));
  const width = widest + FONT_SIZE * (DROP_RADIUS * 2 + PARK_GAP + 0.1) * 2;
  return { words: words.map(word => layoutWord(word, tracked, width)), width };
}

export const BLUE = [36, 72, 216] as const;
export const INK = [8, 9, 12] as const;

/**
 * The slime from the drop to a letter in layout units: it runs from `from`,
 * `fromY` (inside the drop) to `to`, `toY` (inside the letter), `start` thick
 * at the drop and `end` at the letter, each plus `waist`, which thins the
 * middle and below zero parts the two ends. A bead of radius `bead` sits at
 * `beadX`, `beadY`, `beadAt` of the way along, and the thread thins by
 * `pinch` at `spread` (a share of the bridge's length) either side of it.
 */
export type BridgeFrame = {
  from: number;
  fromY: number;
  to: number;
  toY: number;
  start: number;
  end: number;
  waist: number;
  bead: number;
  beadX: number;
  beadY: number;
  beadAt: number;
  pinch: number;
  spread: number;
};

/**
 * A letter drawn at `x`, `y`: scaled by `sx`, `sy` about its own center
 * (`center`, `DROP_Y`), then moved there. `drain` runs from blue to black,
 * the side away from the drop (`toward`, +1 when it lies to the right)
 * setting first.
 */
export type LetterFrame = {
  center: number;
  width: number;
  sx: number;
  sy: number;
  x: number;
  y: number;
  drain: number;
  toward: number;
  bridge: BridgeFrame;
};

/** Everything one frame draws: word `word`'s letters and the drop at `x`, `y`, stretched `sx` by `sy`. */
export type GooFrame = { word: number; letters: LetterFrame[]; drop: { x: number; y: number; sx: number; sy: number } };

/** The width at which the drain wipes across a letter, as a share of the letter. */
export const DRAIN_SOFTNESS = 0.6;

/** The bridge's half-thickness `s` of the way from the drop (0) to the letter (1). */
export function bridgeRadius(bridge: BridgeFrame, s: number): number {
  const base = bridge.waist + bridge.start * (1 - s) * (1 - s) + bridge.end * s * s;
  if (bridge.pinch <= 0 || bridge.spread <= 0) return base;
  const dip = (at: number) => Math.exp(-(((s - at) / (bridge.spread * PINCH_WIDTH)) ** 2));
  return base - bridge.pinch * (dip(bridge.beadAt - bridge.spread) + dip(bridge.beadAt + bridge.spread));
}

/** How wide each thinning either side of the bead is, as a share of its distance from the bead. */
export const PINCH_WIDTH = 0.55;

/** The bridge's outline as an SVG path, for the SVG goo; empty where nothing shows. */
export function bridgePath(bridge: BridgeFrame, steps = 28): string {
  if (bridge.start + bridge.end <= 0) return "";
  const top: string[] = [];
  const bottom: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const s = i / steps;
    const x = bridge.from + (bridge.to - bridge.from) * s;
    const y = bridge.fromY + (bridge.toY - bridge.fromY) * s;
    const r = Math.max(0, bridgeRadius(bridge, s));
    top.push(`${x.toFixed(2)} ${(y - r).toFixed(2)}`);
    bottom.unshift(`${x.toFixed(2)} ${(y + r).toFixed(2)}`);
  }
  return `M${top.join("L")}L${bottom.join("L")}Z`;
}
