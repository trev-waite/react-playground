/**
 * The choreography, as a pure function of time. A blue drop glides to the
 * start of a word, then along it. Each letter is born inside the drop and is
 * left behind as the drop moves on: a fat bridge of slime holds it to the
 * drop and necks down as they part until it pinches off, flinging a bead of
 * slime back into the drop, while the blue drains out of the letter toward
 * the drop and leaves it black. Without stopping, the drop swings back and
 * drops onto the line as the word's period, and the landing sends a wobble
 * back through the word, which sways while the period breathes; then the drop
 * lifts off, gathers itself and slides back, reaching out to each letter in
 * turn and swallowing the word before gliding on.
 *
 * Distances are in font-size units (`em`), so the look holds at any size.
 */

export const TYPE_STEP_MS = 220;
export const ERASE_STEP_MS = 125;
export const GLIDE_MS = 480;
/** From the moment the period lands until the drop slides back. */
export const HOLD_MS = 2200;
/** How long a newborn letter takes to swell to full size. */
export const BLOOM_MS = 680;
/** Once the period lands, a wobble runs back through the word: each letter jiggles this long, the next a beat later. */
export const SETTLE_MS = 900;
export const SETTLE_STAGGER_MS = 70;
/** While the word holds, the drop breathes: it swells and eases back over this period. */
export const BREATH_MS = 1700;
/** Before it slides back to swallow the word, the drop lifts off the line and gathers itself for this long. */
export const WINDUP_MS = 380;
/** The moment the drop turns past the last letter, it swings back and drops onto the line as the period over this long. */
export const LAND_MS = 390;
/** How far into the landing swing the period touches the line, finishing its shrink as it does. */
export const TOUCH = 0.9;
/** The landing's squash wobbles out over this long. */
const THUD_MS = 460;

/** The drop's radius, and how far past the word's last letter it turns. */
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
/** A bridge stretches across this much open gap (em, letter edge to drop edge) before it pinches off. */
export const SNAP_DISTANCE = 0.52;
/** The drop rides this far (em) past a newborn letter's center, so the bridge has room to show. */
export const LEAD = 0.62;
/** How long a newborn letter clings to the drop, riding along with it, before it eases back into its place. */
export const CLING_MS = 360;
/** Where the drop sits at the start of a word, left of its first letter. */
const LEAD_GAP = 0.08;

/** A bridge's half-thickness (em) where it leaves the drop, and where it meets the letter. */
export const BRIDGE_DROP = 0.12;
export const BRIDGE_LETTER = 0.075;
/** The bridge's waist (em, added to both ends' swell): full while drop and letter touch, and just thin enough to have broken at the snap. */
const WAIST_FULL = 0.03;
const WAIST_SNAP = -0.024;
/** After the pinch, both ends of the bridge pull back into their bodies over this long. */
export const RETRACT_MS = 120;
/** The bead of slime left where the bridge pinched: it keeps its size in flight and settles to this as it melts back into the drop, this long after the pinch. */
export const BEAD_RADIUS = 0.06;
export const BEAD_MS = 130;
/** The neck starts to draw out this much (em) before the letter's edge has left the drop's. */
const NECK_START = 0.08;
/** Where along the bridge, from the drop, its neck is thinnest and the bead forms. */
const PINCH = BRIDGE_DROP / (BRIDGE_DROP + BRIDGE_LETTER);
/** The bead swells over this long before the pinch, whole a few frames before the neck visibly parts, and is this big when it pinches. */
const BEADING_MS = 130;
const BEAD_AT_SNAP = 0.085;
/** Over this long before the pinch, the thread thins this much (em) on either side of the bead, so the bead stands out on it. */
const PINCHING_MS = 120;
const PINCH_DEPTH = 0.05;
/** A freed letter springs back from its stretch on this beat. */
const RECOIL_MS = 100;

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
  const run = (letterCount + 1) * TYPE_STEP_MS;
  const type = run + LAND_MS;
  const erase = (letterCount + 1) * ERASE_STEP_MS;
  return { glide: GLIDE_MS, run, type, hold: HOLD_MS, erase, total: GLIDE_MS + type + HOLD_MS + erase };
}

/** Where the drop starts a word, left of its first letter, and where it turns, past the last. */
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

/**
 * The slime between a letter and the drop, in em: its half-thickness where it
 * leaves the drop and where it meets the letter, and a `waist` added to both
 * that thins it in the middle (below zero, the two ends no longer meet). A
 * `bead` of that radius sits `beadAt` of the way from the drop to the letter,
 * and `pinch` thins the neck on either side of it, so it shows as a bead on
 * a thread before the thread breaks.
 */
export type Bridge = { drop: number; letter: number; waist: number; bead: number; beadAt: number; pinch: number };
export const NO_BRIDGE: Bridge = { drop: 0, letter: 0, waist: 0, bead: 0, beadAt: 0, pinch: 0 };

/**
 * `drain` runs from 0 (drop blue) to 1 (black); the blue drains toward the
 * drop, so the letter's far side sets black first.
 */
export type LetterPose = { scale: number; stretch: number; dx: number; dy: number; drain: number; bridge: Bridge };
/**
 * The drop's stretch from its speed comes from the caller, which knows it
 * across frames. `dropSink` is how far below its riding line it sits,
 * `dropScale` its size and breath (1 at full size), and `dropSquash` a stretch
 * it adds on its own: negative squeezes it narrow and tall, positive flat.
 */
export type Pose = { letters: LetterPose[]; dropX: number; dropSink: number; dropScale: number; dropSquash: number };

const HIDDEN: LetterPose = { scale: 0, stretch: 1, dx: 0, dy: 0, drain: 0, bridge: NO_BRIDGE };
const SET: LetterPose = { scale: 1, stretch: 1, dx: 0, dy: 0, drain: 1, bridge: NO_BRIDGE };

/** A wobble `t` (0 to 1) of the way through: a few swings that die away, 0 at both ends. */
function jiggle(t: number): number {
  if (t <= 0 || t >= 1) return 0;
  return Math.exp(-4.2 * t) * Math.sin(t * Math.PI * 2 * 2.4) * (1 - t);
}

/** The drop's breath `ms` after the period lands: it eases in, so the drop does not start swelling the instant it lands. */
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

/** The drop gathering itself `ms` into a squeeze WINDUP_MS long: it draws in narrow, then lets go into the run that follows. */
function gather(ms: number): number {
  const u = ms / WINDUP_MS;
  if (u <= 0 || u >= 1) return 0;
  return -0.2 * Math.sin(u * Math.PI);
}

/** The drop gathering itself `ms` into the hold, just before it slides back to swallow the word. */
export function windup(ms: number): number {
  return gather(ms - (HOLD_MS - WINDUP_MS));
}

/** A freed letter's spring back from its stretch, `ms` after the pinch: 1 at the pinch, overshooting once, settled within 600ms. */
export function recoil(ms: number): number {
  const s = ms / RECOIL_MS;
  if (s < 0) return 1;
  if (s >= 6) return 0;
  return Math.exp(-s * 2.2) * Math.cos(s * 2.6) * (1 - s / 6);
}

/** The bridge across an open gap `d` (em; 0 or less where drop and letter overlap), necking down until it pinches at SNAP_DISTANCE. */
export function bridgeAcross(d: number): Bridge {
  const pull = clamp01((d + NECK_START) / (SNAP_DISTANCE + NECK_START));
  return { ...NO_BRIDGE, drop: BRIDGE_DROP, letter: BRIDGE_LETTER, waist: WAIST_FULL - (WAIST_FULL - WAIST_SNAP) * Math.pow(pull, 1.3), beadAt: PINCH };
}

/**
 * The bridge `ms` before it pinches (`ms` below zero) across gap `d`: a bead
 * swells in the thinning neck and the thread thins on either side of it, as
 * a stretched thread beads up before it breaks, so the pinch leaves a bead
 * that was already there.
 */
export function beading(d: number, ms: number): Bridge {
  return { ...bridgeAcross(d), bead: BEAD_AT_SNAP * smoothstep(-BEADING_MS, -BEADING_MS / 3, ms), pinch: PINCH_DEPTH * smoothstep(-PINCHING_MS, 0, ms) };
}

/** The bridge `ms` after it pinched: both ends snap back into their bodies, fastest at first, and the bead it left flies straight back into the drop. */
export function pinched(ms: number): Bridge {
  const back = 1 - Math.pow(1 - clamp01(ms / RETRACT_MS), 3);
  const home = clamp01(ms / BEAD_MS);
  return {
    drop: BRIDGE_DROP * (1 - back),
    letter: BRIDGE_LETTER * (1 - back),
    waist: WAIST_SNAP - 0.12 * back,
    bead: ms < BEAD_MS ? BEAD_AT_SNAP + (BEAD_RADIUS - BEAD_AT_SNAP) * smoothstep(0.5, 1, home) : 0,
    beadAt: PINCH * (1 - home),
    pinch: PINCH_DEPTH * (1 - back),
  };
}

/** The open gap (em) from a letter's edge to the drop's edge; negative where they overlap. */
function gap(letter: Letter, dx: number, dropX: number, fontSize: number): number {
  const center = letter.left + letter.width / 2 + dx;
  return (Math.abs(dropX - center) - letter.width / 2) / fontSize - DROP_RADIUS;
}

/**
 * How the typing pass leaves one letter, `ms` into typing (past the run too,
 * where the drop has turned and only the letter's own clock runs). The drop
 * is taken where the run left it, so a letter that pinched free stays free
 * while the drop swings back.
 */
function typedLetter(word: WordLayout, index: number, start: number, park: number, run: number, fontSize: number) {
  const letter = word.letters[index]!;
  const center = letter.left + letter.width / 2;
  const bornAt = passing(start, park, center + LEAD * fontSize) * run;
  const reach = (ms: number) => {
    const age = ms - bornAt;
    const dropX = along(start, park, Math.min(ms, run) / run);
    const dx = (dropX - center) * (1 - ease(age / CLING_MS));
    return { age, dropX, dx, gap: gap(letter, dx, dropX, fontSize) };
  };
  let low = bornAt;
  let high = bornAt + run + LAND_MS + HOLD_MS;
  if (reach(high).gap < SNAP_DISTANCE) high = Infinity;
  else
    for (let i = 0; i < 22; i++) {
      const mid = (low + high) / 2;
      if (reach(mid).gap < SNAP_DISTANCE) low = mid;
      else high = mid;
    }
  const snapAt = high;

  return (ms: number): LetterPose => {
    const { age, dx, gap: d } = reach(ms);
    if (age < 0) return HIDDEN;
    const since = ms - snapAt;
    const pull = since < 0 ? clamp01(d / SNAP_DISTANCE) : recoil(since);
    const grown = bloom(age / BLOOM_MS);
    return {
      scale: 0.3 + 0.7 * grown,
      stretch: 1 + 0.32 * pull,
      dx: dx + 0.18 * pull * fontSize,
      dy: (1 - Math.min(1, grown)) * fontSize * 0.08,
      drain: smoothstep(-TYPE_STEP_MS * 0.6, TYPE_STEP_MS * 0.9, since),
      bridge: since < 0 ? beading(d, since) : since < Math.max(RETRACT_MS, BEAD_MS) ? pinched(since) : NO_BRIDGE,
    };
  };
}

/**
 * Every letter's pose and the drop's position `ms` into a word's cycle.
 * `previous` is the word before, where the drop glides in from.
 */
export function poseAt(word: WordLayout, previous: WordLayout, fontSize: number, ms: number): Pose {
  const n = word.letters.length;
  const timing = phases(n);
  const [start, park] = ends(word, fontSize);
  const period = periodAt(word, fontSize);

  if (ms < timing.glide) {
    const from = ends(previous, fontSize)[0];
    return {
      letters: word.letters.map(() => HIDDEN),
      dropX: from + (start - from) * ease(ms / timing.glide),
      dropSink: 0,
      dropScale: 1,
      dropSquash: gather(ms - (timing.glide - WINDUP_MS)),
    };
  }

  let t = ms - timing.glide;
  if (t < timing.type + timing.hold) {
    const typed = word.letters.map((_, index) => typedLetter(word, index, start, park, timing.run, fontSize)(t));
    if (t < timing.run) return { letters: typed, dropX: along(start, park, t / timing.run), dropSink: 0, dropScale: 1, dropSquash: 0 };
    const sinceTouch = t - timing.run - LAND_MS * TOUCH;
    const letters = typed.map((pose, index) => {
      const wobble = jiggle((sinceTouch - (n - 1 - index) * SETTLE_STAGGER_MS) / SETTLE_MS);
      const wave = sway(sinceTouch, index);
      if (wobble === 0 && wave === 0) return pose;
      return { ...pose, stretch: pose.stretch + 0.06 * wobble + 0.02 * wave, dy: pose.dy + (-0.05 * wobble - 0.012 * wave) * fontSize };
    });
    return { letters, ...perched(park, period, t - timing.run, fontSize) };
  }

  t -= timing.type + timing.hold;
  const lifted = period.x + WINDUP_PULL * fontSize;
  const dropX = along(lifted, start, t / timing.erase);
  const grip = smoothstep(0, ERASE_STEP_MS * 1.5, t);
  const letters = word.letters.map(letter => {
    const center = letter.left + letter.width / 2;
    const swallowed = smoothstep(0.45, -0.3, (dropX - center) / fontSize);
    if (swallowed >= 1) return HIDDEN;
    const d = gap(letter, 0, dropX, fontSize);
    const pull = clamp01(d / SNAP_DISTANCE);
    const reach = grip * smoothstep(0, 0.35, 1 - pull);
    const bridge = bridgeAcross(d);
    return {
      scale: 1 - swallowed,
      stretch: 1 + 0.32 * pull * reach,
      dx: (0.18 * pull * reach * fontSize + (dropX - center) * swallowed) * 0.9,
      dy: 0,
      drain: 1 - grip * (1 - smoothstep(0.15, 1, pull)),
      bridge:
        reach > 0 ? { ...bridge, drop: bridge.drop * reach, letter: bridge.letter * reach, waist: bridge.waist - 0.04 * pull - 0.1 * (1 - reach) } : NO_BRIDGE,
    };
  });
  return { letters, dropX, dropSink: 0, dropScale: 1, dropSquash: 0 };
}

/**
 * The drop `ms` after it turned past the last letter. It swings back and
 * drops onto the line as the word's period, shrinking to a dot and landing
 * with a squash, and breathes there. At the end it lifts off, swelling back to
 * full size, pulls back a touch, and squeezes narrow to lunge at the word.
 */
function perched(park: number, period: { x: number; sink: number }, ms: number, fontSize: number) {
  const u = ms / LAND_MS;
  const fall = clamp01((u - 0.08) / (TOUCH - 0.08));
  const held = ms - LAND_MS;
  const lift = ease((held - (HOLD_MS - WINDUP_MS)) / WINDUP_MS);
  const shrink = smoothstep(0.12, TOUCH, u) * (1 - lift);
  const sinceTouch = ms - LAND_MS * TOUCH;
  return {
    dropX: park + (period.x - park) * ease(u) + WINDUP_PULL * fontSize * lift,
    dropSink: period.sink * fall * fall * (1 - lift),
    dropScale: (1 - (1 - PERIOD_SCALE) * shrink) * breath(sinceTouch),
    dropSquash: thud(sinceTouch) + windup(held),
  };
}

/** The word as it reads at rest, for a still frame: every letter set black, and the drop its period. */
export function restingPose(word: WordLayout, fontSize: number): Pose {
  const period = periodAt(word, fontSize);
  return {
    letters: word.letters.map(() => SET),
    dropX: period.x,
    dropSink: period.sink,
    dropScale: PERIOD_SCALE,
    dropSquash: 0,
  };
}
