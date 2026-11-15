/**
 * The choreography, as a pure function of time. A blue drop glides to the
 * start of a word, then along it. Each letter is born inside the drop and is
 * left behind as the drop moves on: it stretches toward the drop on a strand
 * of slime that thins as they part, the strand snaps, and the letter, free,
 * turns black. The drop rolls back and lands on the line as the word's
 * period, and the word settles with a wobble and sways while the period
 * breathes; then the drop lifts off, gathers itself and slides back, the
 * strands reach out again, and it swallows the word letter by letter before
 * gliding on.
 *
 * Distances are in font-size units (`em`), so the look holds at any size.
 */

export const TYPE_STEP_MS = 220;
export const ERASE_STEP_MS = 125;
export const GLIDE_MS = 720;
export const HOLD_MS = 2400;
/** How long a newborn letter takes to swell to full size. */
export const BLOOM_MS = 680;
/** Once the drop parks, a wobble runs back through the word: each letter jiggles this long, the next a beat later. */
export const SETTLE_MS = 900;
export const SETTLE_STAGGER_MS = 70;
/** While the word holds, the drop breathes: it swells and eases back over this period. */
export const BREATH_MS = 1700;
/** Before it slides back to swallow the word, the drop lifts off the line and gathers itself for this long. */
export const WINDUP_MS = 380;
/** Once the last letter snaps free, the drop rolls back and lands on the line as the word's period over this long. */
export const PERIOD_MS = 620;
/** The landing's squash wobbles out over this long. */
const THUD_MS = 460;

/** The drop's radius, and how far past the word's last letter it parks. */
export const DROP_RADIUS = 0.17;
export const PARK_GAP = 0.6;
/** The drop rides this high (em) above the baseline, through the middle of the lowercase letters. */
export const RIDE_HEIGHT = 0.27;
/** As the word's period, the drop shrinks to this share of its size. */
export const PERIOD_SCALE = 0.52;
/** Open space (em) between the last letter's advance and the period. */
const PERIOD_GAP = 0.04;
/** How far (em) the drop pulls back off the period as it winds up, so it lunges at the word from a little way off. */
const WINDUP_PULL = 0.16;
/** A strand stretches across this much open gap (em, letter edge to drop edge) before it snaps. */
export const SNAP_DISTANCE = 0.4;
/** The drop rides this far (em) past a newborn letter's center, so the strand has room to show. */
export const LEAD = 0.62;
/** How long a newborn letter clings to the drop, riding along with it, before it eases back into its place. */
export const CLING_MS = 360;
/** A strand's width where it leaves the drop, as a fraction of the drop's diameter. */
const STRAND_WIDTH = 0.62;
/** Where the drop sits at the start of a word, left of its first letter. */
const LEAD_GAP = 0.08;

export type Letter = { char: string; left: number; width: number };
export type WordLayout = { letters: Letter[]; left: number; width: number };

/** Centers a word measured with `measure` (the advance of a prefix) on a line `lineWidth` wide. */
export function layoutWord(word: string, measure: (text: string) => number, lineWidth: number): WordLayout {
  const chars = [...word];
  const width = measure(word);
  const left = (lineWidth - width) / 2;
  const letters = chars.map((char, index) => {
    const before = measure(chars.slice(0, index).join(""));
    return { char, left: left + before, width: measure(chars.slice(0, index + 1).join("")) - before };
  });
  return { letters, left, width };
}

function clamp01(t: number) {
  return Math.min(1, Math.max(0, t));
}

/** Smooth in and out. */
export function ease(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function smoothstep(edge0: number, edge1: number, x: number) {
  return ease((x - edge0) / (edge1 - edge0));
}

/** A soft spring from 0 to 1 that overshoots once, like a bubble filling out. */
export function bloom(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const omega = 14;
  const zeta = 0.42;
  const s = t * (BLOOM_MS / 1000) * 1.6;
  const damped = omega * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * omega * s) * (Math.cos(damped * s) + ((zeta * omega) / damped) * Math.sin(damped * s));
}

export function phases(letterCount: number) {
  const type = (letterCount + 1) * TYPE_STEP_MS + BLOOM_MS;
  const erase = (letterCount + 1) * ERASE_STEP_MS;
  return { glide: GLIDE_MS, type, hold: HOLD_MS, erase, total: GLIDE_MS + type + HOLD_MS + erase };
}

/** Where the drop starts a word, left of its first letter, and where it parks, past the last. */
function ends(word: WordLayout, fontSize: number): [number, number] {
  const first = word.letters[0];
  const last = word.letters.at(-1);
  if (!first || !last) return [word.left, word.left];
  return [first.left - (DROP_RADIUS + LEAD_GAP) * fontSize, last.left + last.width + (DROP_RADIUS + PARK_GAP) * fontSize];
}

/** Share of a run spent speeding up, and again slowing down; the middle cruises at an even pace. */
const RAMP = 0.2;

/** Progress (0 to 1) along a run `t` of the way through it: eased at both ends, even in between, so the drop keeps its momentum past each letter. */
export function cruise(t: number): number {
  const x = clamp01(t);
  const top = 1 / (1 - RAMP);
  if (x < RAMP) return (top * x * x) / (2 * RAMP);
  if (x > 1 - RAMP) return 1 - (top * (1 - x) * (1 - x)) / (2 * RAMP);
  return top * (x - RAMP / 2);
}

/** The drop's x `t` of the way along a run from `from` to `to`. */
function along(from: number, to: number, t: number): number {
  return from + (to - from) * cruise(t);
}

/** When (0 to 1 through the run) the drop passes `x`, for a run from `from` to `to`. */
function passing(from: number, to: number, x: number): number {
  const target = (x - from) / (to - from || 1);
  let low = 0;
  let high = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (low + high) / 2;
    if (cruise(mid) < target) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/** Where the period sits: just past the word's last letter, `x`, and resting on the baseline, `sink` below the line the drop rides. */
export function periodAt(word: WordLayout, fontSize: number): { x: number; sink: number } {
  const last = word.letters.at(-1);
  const radius = DROP_RADIUS * PERIOD_SCALE;
  const edge = last ? last.left + last.width : word.left;
  return { x: edge + (PERIOD_GAP + radius) * fontSize, sink: (RIDE_HEIGHT - radius) * fontSize };
}

/** `ink` runs from 0 (drop blue) to 1 (black). `strand` is a width in em, 0 when snapped. */
export type LetterPose = { scale: number; stretch: number; dx: number; dy: number; ink: number; strand: number };
/**
 * The drop's stretch from its speed comes from the caller, which knows it
 * across frames. `dropSink` is how far below its riding line it sits,
 * `dropScale` its size and breath (1 at full size), and `dropSquash` a stretch
 * it adds on its own: negative squeezes it narrow and tall, positive flat.
 */
export type Pose = { letters: LetterPose[]; dropX: number; dropSink: number; dropScale: number; dropSquash: number };

/** A wobble `t` (0 to 1) of the way through: a few swings that die away, 0 at both ends. */
function jiggle(t: number): number {
  if (t <= 0 || t >= 1) return 0;
  return Math.exp(-4.2 * t) * Math.sin(t * Math.PI * 2 * 2.4) * (1 - t);
}

/** The drop's breath `ms` into the hold: it eases in, so the drop does not start swelling the instant it parks. */
export function breath(ms: number): number {
  const fade = smoothstep(0, 500, ms);
  return 1 + 0.045 * fade * Math.sin((ms / BREATH_MS) * Math.PI * 2);
}

/**
 * Letter `index`'s soft sway `ms` into the hold, -1 to 1: a slow wave through
 * the word in time with the drop's breath. It rises once the settling wobble
 * has died and falls away before the drop winds up, so the erase starts at rest.
 */
export function sway(ms: number, index: number): number {
  const rise = smoothstep(SETTLE_MS * 0.6, SETTLE_MS * 1.4, ms);
  const fall = 1 - smoothstep(HOLD_MS - WINDUP_MS - 400, HOLD_MS - WINDUP_MS, ms);
  return rise * fall * Math.sin((ms / BREATH_MS) * Math.PI * 2 - index * 0.65);
}

/** The drop flattening as it lands on the line `ms` after impact: wide at first, then a few swings that die away. */
export function thud(ms: number): number {
  const t = ms / THUD_MS;
  if (t <= 0 || t >= 1) return 0;
  return 0.34 * Math.exp(-3.5 * t) * Math.cos(t * Math.PI * 2 * 1.6) * (1 - t);
}

/** The drop gathering itself `ms` into the hold: it squeezes narrow just before the run back, then lets go into it. */
export function windup(ms: number): number {
  const u = (ms - (HOLD_MS - WINDUP_MS)) / WINDUP_MS;
  if (u <= 0 || u >= 1) return 0;
  return -0.2 * Math.sin(u * Math.PI);
}

/** How far (em) the drop travels past a snap while the freed letter springs back to shape: about 100ms at typing pace. */
const RECOIL = 0.14;

/**
 * How a letter hangs off the drop across an open gap `d` (em, from the
 * letter's edge to the drop's; 0 or less where they overlap), the drop lying
 * `toward` it (+1 right, -1 left). Attached, it leans and stretches toward the
 * drop on a strand that thins as they part. Past the snap it springs back to
 * shape, overshooting a touch, and turns from blue to black in the same beat.
 */
export function tether(d: number, toward: number) {
  const reach = Math.max(0, d);
  if (reach < SNAP_DISTANCE) {
    const pull = reach / SNAP_DISTANCE;
    return {
      strand: STRAND_WIDTH * DROP_RADIUS * 2 * Math.pow(1 - pull, 1.2),
      stretch: 1 + 0.32 * pull,
      lean: toward * 0.18 * pull,
      ink: smoothstep(SNAP_DISTANCE * 0.7, SNAP_DISTANCE * 1.5, reach),
    };
  }
  const since = (reach - SNAP_DISTANCE) / RECOIL;
  const spring = Math.exp(-since * 2.2) * Math.cos(since * 2.6);
  return {
    strand: 0,
    stretch: 1 + 0.32 * spring,
    lean: toward * 0.18 * spring,
    ink: smoothstep(SNAP_DISTANCE * 0.7, SNAP_DISTANCE * 1.5, reach),
  };
}

/** The open gap (em) from a letter's edge to the drop's edge; negative where they overlap. */
function gap(letter: Letter, dx: number, dropX: number, fontSize: number): number {
  const center = letter.left + letter.width / 2 + dx;
  return (Math.abs(dropX - center) - letter.width / 2) / fontSize - DROP_RADIUS;
}

/**
 * Every letter's pose and the drop's position `ms` into a word's cycle.
 * `previous` is the word before, where the drop glides in from.
 */
export function poseAt(word: WordLayout, previous: WordLayout, fontSize: number, ms: number): Pose {
  const n = word.letters.length;
  const timing = phases(n);
  const [start, park] = ends(word, fontSize);
  const hidden = word.letters.map(() => ({ scale: 0, stretch: 1, dx: 0, dy: 0, ink: 0, strand: 0 }));

  if (ms < timing.glide) {
    const from = ends(previous, fontSize)[0];
    return { letters: hidden, dropX: from + (start - from) * ease(ms / timing.glide), dropSink: 0, dropScale: 1, dropSquash: 0 };
  }

  let t = ms - timing.glide;
  if (t < timing.type) {
    const run = (n + 1) * TYPE_STEP_MS;
    const dropX = along(start, park, t / run);
    const letters = word.letters.map((letter, index) => {
      const center = letter.left + letter.width / 2;
      const bornAt = center + LEAD * fontSize;
      const age = t - passing(start, park, bornAt) * run;
      if (age < 0) return hidden[index]!;
      const dx = (dropX - center) * (1 - ease(age / CLING_MS));
      const pull = tether(gap(letter, dx, dropX, fontSize), 1);
      const grown = bloom(age / BLOOM_MS);
      return {
        scale: 0.3 + 0.7 * grown,
        stretch: pull.stretch,
        dx: dx + pull.lean * fontSize,
        dy: (1 - Math.min(1, grown)) * fontSize * 0.08,
        ink: pull.ink,
        strand: pull.strand,
      };
    });
    return { letters, dropX, dropSink: 0, dropScale: 1, dropSquash: 0 };
  }

  t -= timing.type;
  if (t < timing.hold) {
    const settled = word.letters.map((_, index) => {
      const wobble = jiggle((t - (n - 1 - index) * SETTLE_STAGGER_MS) / SETTLE_MS);
      const wave = sway(t, index);
      return {
        scale: 1,
        stretch: 1 + 0.15 * wobble + 0.02 * wave,
        dx: 0,
        dy: (-0.05 * wobble - 0.012 * wave) * fontSize,
        ink: 1,
        strand: 0,
      };
    });
    return { letters: settled, ...perched(park, periodAt(word, fontSize), t, fontSize) };
  }

  t -= timing.hold;
  const dropX = along(periodAt(word, fontSize).x + WINDUP_PULL * fontSize, start, t / ((n + 1) * ERASE_STEP_MS));
  const grip = smoothstep(0, ERASE_STEP_MS * 1.5, t);
  const letters = word.letters.map(letter => {
    const center = letter.left + letter.width / 2;
    const swallowed = smoothstep(0.45, -0.3, (dropX - center) / fontSize);
    if (swallowed >= 1) return { scale: 0, stretch: 1, dx: 0, dy: 0, ink: 0, strand: 0 };
    const pull = tether(gap(letter, 0, dropX, fontSize), 1);
    return {
      scale: 1 - swallowed,
      stretch: 1 + (pull.stretch - 1) * grip,
      dx: (pull.lean * grip * fontSize + (dropX - center) * swallowed) * 0.9,
      dy: 0,
      ink: 1 - (1 - Math.min(pull.ink, 1 - swallowed)) * grip,
      strand: pull.strand * grip,
    };
  });
  return { letters, dropX, dropSink: 0, dropScale: 1, dropSquash: 0 };
}

/**
 * The drop `ms` into the hold. It rolls back from where it parked and falls
 * onto the line as the word's period, shrinking to a dot and landing with a
 * squash, and breathes there. At the end it lifts off, swelling back to full
 * size, pulls back a touch, and squeezes narrow to lunge at the word.
 */
function perched(park: number, period: { x: number; sink: number }, ms: number, fontSize: number) {
  const land = ms / PERIOD_MS;
  const fall = clamp01((land - 0.15) / 0.6);
  const lift = ease((ms - (HOLD_MS - WINDUP_MS)) / WINDUP_MS);
  const shrink = ease(land / 0.8) * (1 - lift);
  return {
    dropX: park + (period.x - park) * ease(land) + WINDUP_PULL * fontSize * lift,
    dropSink: period.sink * fall * fall * (1 - lift),
    dropScale: (1 - (1 - PERIOD_SCALE) * shrink) * breath(ms),
    dropSquash: thud(ms - PERIOD_MS * 0.75) + windup(ms),
  };
}

/** The word as it reads at rest, for a still frame: every letter set black, and the drop its period. */
export function restingPose(word: WordLayout, fontSize: number): Pose {
  const period = periodAt(word, fontSize);
  return {
    letters: word.letters.map(() => ({ scale: 1, stretch: 1, dx: 0, dy: 0, ink: 1, strand: 0 })),
    dropX: period.x,
    dropSink: period.sink,
    dropScale: PERIOD_SCALE,
    dropSquash: 0,
  };
}
