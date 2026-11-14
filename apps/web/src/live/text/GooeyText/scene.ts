import { DROP_RADIUS, PARK_GAP, layoutWord, type WordLayout } from "./timeline";

/** Layout units: the font is set at this size and the line scales to fit. */
export const FONT_SIZE = 100;
export const fontAt = (size: number) => `720 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
export const FONT = fontAt(FONT_SIZE);
export const BASELINE = FONT_SIZE * 0.95;
/** The drop rides at the middle of the lowercase letters. */
export const DROP_Y = BASELINE - FONT_SIZE * 0.27;
export const HEIGHT = FONT_SIZE * 1.3;
export const DROP_SIZE = FONT_SIZE * DROP_RADIUS;
/** How far the goo is blurred before its edge is cut back to a hard line. */
export const GOO_BLUR = FONT_SIZE * 0.045;
/** The goo's alpha after the blur is `GOO_GAIN * alpha - GOO_CUT`. */
export const GOO_GAIN = 40;
export const GOO_CUT = 18;
/** Room around the line for goo that spills past it: a blooming descender, the blur's fringe. */
export const SPILL_X = FONT_SIZE * 0.1;
export const SPILL_Y = FONT_SIZE * 0.2;
/** Room between letters, so the goo joins a letter to the drop but not to its neighbors. */
const TRACKING = FONT_SIZE * 0.035;

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
  const width = widest + FONT_SIZE * (DROP_RADIUS * 2 + PARK_GAP + 0.25) * 2;
  return { words: words.map(word => layoutWord(word, tracked, width)), width };
}

export const BLUE = [36, 72, 216] as const;
const INK = [17, 19, 24] as const;

/** The letter's color, 0 to 255 per channel, `ink` of the way from drop blue to black. */
export function inkColor(ink: number): [number, number, number] {
  const mix = (i: 0 | 1 | 2) => Math.round(BLUE[i] + (INK[i] - BLUE[i]) * ink);
  return [mix(0), mix(1), mix(2)];
}

/**
 * A letter drawn at `x`, `y`: scaled by `sx`, `sy` about its own center
 * (`center`, `DROP_Y`), then moved there. `strand` is the slime that ties it
 * to the drop, `width` 0 once snapped.
 */
export type LetterFrame = {
  center: number;
  sx: number;
  sy: number;
  x: number;
  y: number;
  ink: number;
  strand: { from: number; to: number; width: number };
};

/** Everything one frame draws: word `word`'s letters and the drop, stretched `sx` by `sy`. */
export type GooFrame = { word: number; letters: LetterFrame[]; drop: { x: number; sx: number; sy: number } };
