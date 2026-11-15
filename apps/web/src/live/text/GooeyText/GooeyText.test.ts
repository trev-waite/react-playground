import { describe, expect, test } from "bun:test";
import {
  BEAD_MS,
  BEAD_RADIUS,
  BRIDGE_DROP,
  DROP_RADIUS,
  ERASE_STEP_MS,
  GULP_MS,
  HOLD_MS,
  LAND_MS,
  LEAD,
  NO_BRIDGE,
  PERIOD_SCALE,
  RETRACT_MS,
  RIDE_HEIGHT,
  ROUND,
  SETTLE_MS,
  SETTLE_STAGGER_MS,
  TOUCH,
  TYPE_STEP_MS,
  WINDUP_MS,
  bloom,
  breath,
  ease,
  gulp,
  layoutWord,
  periodAt,
  phases,
  pinched,
  poseAt,
  recoil,
  restingPose,
  sway,
  windup,
  type LetterPose,
} from "./timeline";
import { blobRadius } from "./scene";

const FONT = 100;
const measure = (text: string) => text.length * 60;
const hello = layoutWord("hello", measure, 800);
const flow = layoutWord("flow", measure, 800);
const timing = phases(hello.letters.length);
const lastEdge = hello.letters.at(-1)!.left + hello.letters.at(-1)!.width;

/** Pose of `hello` `ms` into its hold. */
const holding = (ms: number) => poseAt(hello, flow, FONT, timing.glide + timing.type + ms);
/** Once the period has landed and its squash has died, until it lifts off again. */
const PERCHED: [number, number] = [500, HOLD_MS - WINDUP_MS];

/** Pose of `hello` `ms` into its typing phase. */
const typing = (ms: number) => poseAt(hello, flow, FONT, timing.glide + ms);

/** The first moment (ms into typing) letter `index` exists. */
function birth(index: number): number {
  for (let ms = 0; ms < timing.type; ms += 0.5) if (typing(ms).letters[index]!.scale > 0) return ms;
  return Infinity;
}

describe("Gooey Text layout", () => {
  test("centers the word and places each letter at its advance", () => {
    expect(hello.left).toBe(250);
    expect(hello.letters.map(letter => letter.left)).toEqual([250, 310, 370, 430, 490]);
  });
});

/** The thinnest the bridge gets between drop and letter (em); at or below zero it has parted. */
const neck = (letter: LetterPose) => {
  const { drop, letter: end, waist } = letter.bridge;
  return drop + end > 0 ? waist + (drop * end) / (drop + end) : -Infinity;
};

/** The first moment (ms into typing) letter `index`'s bridge has pinched: its waist is down to where it breaks. */
function pinchOf(index: number): number {
  const broken = pinched(0).waist + 1e-9;
  for (let ms = birth(index); ms < timing.type; ms += 0.5) {
    const { bridge } = typing(ms).letters[index]!;
    if (bridge !== NO_BRIDGE && bridge.waist <= broken) return ms;
  }
  return Infinity;
}

describe("Gooey Text slime", () => {
  test("a letter is born blue, inside the drop, on a fat bridge of slime", () => {
    const born = typing(birth(0) + 10).letters[0]!;
    expect(born.drain).toBe(0);
    expect(neck(born)).toBeGreaterThan(0.06);
    expect(born.scale).toBeGreaterThan(0.25);
  });

  test("the bridge necks down as the drop pulls away, faster as it thins, and pinches off", () => {
    const necks: number[] = [];
    for (let ms = birth(0) + 1; ms < pinchOf(0); ms += 4) necks.push(neck(typing(ms).letters[0]!));
    expect(necks.length).toBeGreaterThan(8);
    expect(necks.every((width, i) => i === 0 || width <= necks[i - 1]! + 1e-9)).toBe(true);
    const thinning = necks.slice(1).map((width, i) => necks[i]! - width);
    expect(Math.max(...thinning.slice(-4))).toBeGreaterThan(Math.max(...thinning.slice(0, 4)));
    expect(necks.at(-1)!).toBeLessThan(0.03);
    expect(neck(typing(pinchOf(0) + 30).letters[0]!)).toBeLessThan(0);
  });

  test("a bead swells in the neck as it thins, before the pinch, and not while the bridge is fat", () => {
    const beads: number[] = [];
    for (let ms = birth(0) + 1; ms < pinchOf(0); ms += 4) beads.push(typing(ms).letters[0]!.bridge.bead);
    expect(beads[0]).toBe(0);
    expect(beads.every((bead, i) => i === 0 || bead >= beads[i - 1]! - 1e-9)).toBe(true);
    expect(beads.at(-1)!).toBeGreaterThan(0);
  });

  test("the pinch leaves a bead that flies back into the drop, and both ends pull back into their bodies", () => {
    const at = (ms: number) => typing(pinchOf(0) + ms).letters[0]!.bridge;
    const before = typing(pinchOf(0) - 1).letters[0]!.bridge;
    expect(before.bead).toBeGreaterThan(BEAD_RADIUS * 0.6);
    expect(Math.abs(at(0).bead - before.bead)).toBeLessThan(0.005);
    expect(at(BEAD_MS * 0.45).bead).toBeGreaterThan(at(0).bead * 0.97);
    expect(at(BEAD_MS - 1).bead).toBeCloseTo(BEAD_RADIUS, 2);
    expect(at(BEAD_MS / 2).beadAt).toBeLessThan(at(0).beadAt);
    expect(at(BEAD_MS / 2).beadAt).toBeGreaterThan(0);
    expect(at(RETRACT_MS / 2).drop).toBeLessThan(BRIDGE_DROP);
    expect(at(Math.max(BEAD_MS, RETRACT_MS) + 1)).toEqual(NO_BRIDGE);
  });

  test("the blue drains out of a letter around its pinch, the side away from the drop setting first", () => {
    const pinch = pinchOf(0);
    expect(typing(pinch - TYPE_STEP_MS).letters[0]!.drain).toBe(0);
    const middle = typing(pinch).letters[0]!.drain;
    expect(middle).toBeGreaterThan(0.2);
    expect(middle).toBeLessThan(0.8);
    expect(typing(pinch + TYPE_STEP_MS).letters[0]!.drain).toBe(1);
  });

  test("a letter stretches toward the drop while the bridge holds it, and springs back once free", () => {
    const pulled = typing(pinchOf(0) - 8).letters[0]!;
    expect(pulled.stretch).toBeGreaterThan(1.2);
    expect(pulled.dx).toBeGreaterThan(0);
    const free = typing(pinchOf(0) + 700).letters[0]!;
    expect(free.stretch).toBe(1);
    expect(free.dx).toBeCloseTo(0, 1);
    expect(Math.abs(recoil(0) - 1)).toBeLessThan(1e-9);
    expect(Math.min(...Array.from({ length: 60 }, (_, i) => recoil(i * 10)))).toBeLessThan(0);
  });

  test("by the time the period lands every letter, the last included, has pinched free and set black", () => {
    const end = typing(timing.type - 1);
    expect(end.letters.every(letter => letter.bridge === NO_BRIDGE && letter.drain === 1)).toBe(true);
  });
});

describe("Gooey Text timeline", () => {
  test("the word is hidden while the drop glides in, and black and whole while it holds", () => {
    expect(poseAt(hello, flow, FONT, 0).letters.every(letter => letter.scale === 0)).toBe(true);
    const held = holding(10);
    expect(held.letters.every(letter => Math.abs(letter.scale - 1) < 0.01 && letter.drain === 1 && letter.bridge === NO_BRIDGE)).toBe(true);
  });

  test("the drop goes from freeing the last letter to landing as the period in one unbroken move", () => {
    const pinch = pinchOf(hello.letters.length - 1);
    const touch = timing.run + LAND_MS * TOUCH;
    expect(touch - pinch).toBeLessThan(600);
    const speeds: number[] = [];
    for (let ms = pinch; ms < touch; ms += 4) speeds.push(Math.abs(typing(ms + 4).dropX - typing(ms).dropX) + Math.abs(typing(ms + 4).dropSink - typing(ms).dropSink));
    const still = speeds.filter(speed => speed < 0.05).length;
    expect(still).toBeLessThanOrEqual(2);
  });

  test("swinging back, the drop hops up off its line before it falls onto the period", () => {
    const landing = Array.from({ length: 100 }, (_, i) => typing(timing.run + (LAND_MS * TOUCH * i) / 100));
    const sinks = landing.map(pose => pose.dropSink);
    const apex = sinks.indexOf(Math.min(...sinks));
    expect(sinks[apex]!).toBeLessThan(-0.08 * FONT);
    expect(sinks.slice(0, apex).every(sink => sink <= 0)).toBe(true);
    expect(landing[apex]!.dropX).toBeGreaterThan(periodAt(hello, FONT).x);
    expect(landing[apex]!.dropX).toBeLessThan(landing[0]!.dropX);
  });

  test("through the turn and the hop the drop draws one smooth curve: it never stops, and never turns a corner", () => {
    const point = (ms: number) => ({ x: typing(ms).dropX, y: typing(ms).dropSink });
    let heading: number | null = null;
    for (let ms = timing.run - 200; ms < timing.run + LAND_MS * TOUCH; ms += 1) {
      const [a, b] = [point(ms - 1), point(ms + 1)];
      expect(Math.hypot(b.x - a.x, b.y - a.y) / 2).toBeGreaterThan(0.0003 * FONT);
      const now = Math.atan2(b.y - a.y, b.x - a.x);
      if (heading !== null) expect(Math.abs(Math.atan2(Math.sin(now - heading), Math.cos(now - heading)))).toBeLessThan((5 * Math.PI) / 180);
      heading = now;
    }
  });

  test("the landing hands over to the hold without a jump", () => {
    const before = typing(timing.type - 0.01);
    const after = holding(0);
    expect(after.dropX).toBeCloseTo(before.dropX, 1);
    expect(after.dropSink).toBeCloseTo(before.dropSink, 1);
    expect(after.dropScale).toBeCloseTo(before.dropScale, 2);
  });

  test("the drop rolls back and lands on the baseline just past the last letter, a period's size", () => {
    const period = periodAt(hello, FONT);
    const landed = holding(PERCHED[0]);
    expect(landed.dropX).toBeCloseTo(period.x, 0);
    expect(landed.dropX - lastEdge).toBeLessThan(0.25 * FONT);
    expect(landed.dropX - DROP_RADIUS * PERIOD_SCALE * FONT).toBeGreaterThan(lastEdge);
    expect(landed.dropSink).toBeCloseTo(period.sink, 5);
    expect(period.sink + DROP_RADIUS * PERIOD_SCALE * FONT).toBeCloseTo(RIDE_HEIGHT * FONT, 5);
    expect(landed.dropScale / PERIOD_SCALE).toBeCloseTo(1, 1);
  });

  test("the period lands with a flattening squash that dies away", () => {
    const squashes = Array.from({ length: 200 }, (_, i) => typing(timing.run + LAND_MS * 0.6 + i * 4).dropSquash);
    expect(Math.max(...squashes)).toBeGreaterThan(0.2);
    expect(holding(PERCHED[0]).dropSquash).toBe(0);
  });

  test("the reduced-motion still shows the word set black with its period", () => {
    const still = restingPose(hello, FONT);
    const period = periodAt(hello, FONT);
    expect(still.letters.every(letter => letter.scale === 1 && letter.drain === 1 && letter.bridge === NO_BRIDGE && letter.stretch === 1)).toBe(true);
    expect([still.dropX, still.dropSink, still.dropScale, still.dropSquash]).toEqual([period.x, period.sink, PERIOD_SCALE, 0]);
  });

  test("the period lifts off to full size on its riding line before the erase, which starts from where it lifted", () => {
    const lifted = holding(HOLD_MS - 0.01);
    expect(lifted.dropSink).toBeCloseTo(0, 1);
    expect(lifted.dropScale).toBeCloseTo(1, 1);
    expect(lifted.dropX).toBeGreaterThan(periodAt(hello, FONT).x);
    const erasing = holding(HOLD_MS);
    expect(erasing.dropX).toBeCloseTo(lifted.dropX, 0);
    expect(erasing.dropSink).toBe(0);
  });

  test("the erase grips the word gradually, so no letter flashes blue the instant it starts", () => {
    const erase = (ms: number) => holding(HOLD_MS + ms).letters.at(-1)!;
    expect(erase(0).drain).toBe(1);
    expect(erase(0).bridge).toEqual(NO_BRIDGE);
    let previous = erase(0);
    for (let ms = 4; ms <= ERASE_STEP_MS; ms += 4) {
      const now = erase(ms);
      expect(previous.drain - now.drain).toBeLessThan(0.1);
      expect(now.bridge.drop - previous.bridge.drop).toBeLessThan(0.03);
      previous = now;
    }
    expect(neck(erase(ERASE_STEP_MS * 1.5))).toBeGreaterThan(0);
  });

  test("as the period lands, a wobble runs back through the word from the letter nearest it, then dies away", () => {
    const at = (ms: number) => typing(timing.run + LAND_MS * TOUCH + ms).letters;
    const firstMoves = (index: number) => {
      for (let ms = 0; ms < HOLD_MS; ms += 2) if (Math.abs(at(ms)[index]!.stretch - 1) > 0.005) return ms;
      return Infinity;
    };
    expect(firstMoves(4)).toBeLessThan(firstMoves(3));
    expect(firstMoves(1)).toBeLessThan(firstMoves(0));
    const swing = (from: number, to: number) =>
      Math.max(...Array.from({ length: 100 }, (_, i) => Math.abs(at(from + ((to - from) * i) / 100)[4]!.stretch - 1)));
    const settling = swing(0, SETTLE_MS);
    expect(settling).toBeGreaterThan(0.025);
    expect(settling).toBeLessThan(0.07);
    // Once the wobble has died, only the soft sway is left: a few percent at most.
    expect(swing(SETTLE_MS + hello.letters.length * SETTLE_STAGGER_MS, HOLD_MS)).toBeLessThan(0.025);
  });

  test("the word sways softly through the hold, then comes to rest before the drop winds up", () => {
    const at = (ms: number) => holding(ms).letters;
    const mid = at(HOLD_MS * 0.6);
    expect(mid.some(letter => Math.abs(letter.stretch - 1) > 0.005)).toBe(true);
    expect(new Set(mid.map(letter => letter.stretch.toFixed(4))).size).toBeGreaterThan(1);
    expect(at(HOLD_MS - WINDUP_MS).every(letter => letter.stretch === 1 && letter.dy === 0)).toBe(true);
    expect(sway(0, 0)).toBe(0);
  });

  test("the period breathes while the word holds, gently", () => {
    const [from, to] = PERCHED;
    const scales = Array.from({ length: 100 }, (_, i) => holding(from + ((to - from) * i) / 100).dropScale / PERIOD_SCALE);
    expect(Math.max(...scales)).toBeGreaterThan(1.02);
    expect(Math.min(...scales)).toBeLessThan(0.98);
    expect(scales.every(scale => Math.abs(scale - 1) <= 0.05)).toBe(true);
    expect(breath(0)).toBe(1);
  });

  test("the drop squeezes narrow just before it slides back, and not while it types", () => {
    const squash = (ms: number) => holding(ms).dropSquash;
    expect(squash(HOLD_MS - WINDUP_MS - 1)).toBe(0);
    expect(squash(HOLD_MS - WINDUP_MS / 2)).toBeLessThan(-0.15);
    expect(windup(HOLD_MS)).toBe(0);
    expect(typing(100).dropSquash).toBe(0);
  });

  test("the drop gathers itself the same way before each typing run", () => {
    expect(poseAt(hello, flow, FONT, timing.glide - WINDUP_MS / 2).dropSquash).toBeLessThan(-0.15);
    expect(poseAt(hello, flow, FONT, 1).dropSquash).toBe(0);
  });

  test("letters are born left to right, each out of the drop as it leads past", () => {
    for (let i = 1; i < hello.letters.length; i++) {
      expect(birth(i)).toBeGreaterThan(birth(i - 1));
      const born = typing(birth(i));
      const letter = hello.letters[i]!;
      expect(Math.abs(born.dropX - (letter.left + letter.width / 2 + LEAD * FONT))).toBeLessThan(3);
    }
  });

  test("each time a letter oozes out, the drop shrinks, then swells back past full and settles", () => {
    for (let i = 0; i < hello.letters.length; i++) {
      const scales = Array.from({ length: 60 }, (_, k) => typing(birth(i) + (GULP_MS * k) / 60).dropScale);
      const low = scales.indexOf(Math.min(...scales));
      expect(scales[low]!).toBeLessThan(0.92);
      expect(Math.max(...scales.slice(low))).toBeGreaterThan(1.02);
    }
    expect(typing(birth(0) - 1).dropScale).toBe(1);
    expect([gulp(0), gulp(GULP_MS)]).toEqual([1, 1]);
  });

  test("as a letter oozes out, the drop is drawn out toward it, then sloshes forward, and comes back round", () => {
    const reach = (ms: number, angle: number) => blobRadius(typing(ms).dropBlob, angle);
    for (let i = 0; i < hello.letters.length; i++) {
      const length = Math.min(GULP_MS, (i + 1 < hello.letters.length ? birth(i + 1) : Infinity) - birth(i));
      const times = Array.from({ length: 60 }, (_, k) => birth(i) + (length * k) / 60);
      const lean = times.map(ms => reach(ms, Math.PI) - reach(ms, 0));
      const back = lean.indexOf(Math.max(...lean));
      expect(lean[back]!).toBeGreaterThan(0.15);
      expect(Math.min(...lean.slice(back))).toBeLessThan(-0.05);
      const rims = times.map(ms => Array.from({ length: 12 }, (_, a) => reach(ms, (a / 12) * Math.PI * 2)));
      expect(rims.some(rim => Math.max(...rim) - Math.min(...rim) > 0.25)).toBe(true);
    }
    expect(typing(birth(0) - 1).dropBlob).toEqual(ROUND);
    expect(holding(PERCHED[0]).dropBlob).toEqual(ROUND);
    expect(restingPose(hello, FONT).dropBlob).toEqual(ROUND);
    expect(Array.from({ length: 8 }, (_, a) => blobRadius(ROUND, a))).toEqual(Array(8).fill(1));
  });

  test("the drop keeps its momentum past each letter, slowing only at the ends", () => {
    const speeds: number[] = [];
    for (let ms = 1; ms < (hello.letters.length + 1) * TYPE_STEP_MS; ms += 4) speeds.push(typing(ms + 4).dropX - typing(ms).dropX);
    const middle = speeds.slice(Math.floor(speeds.length * 0.3), Math.floor(speeds.length * 0.7));
    expect(Math.min(...middle)).toBeGreaterThan(Math.max(...middle) * 0.98);
  });

  test("the drop types rightward, then erases leftward back to where it began", () => {
    const start = typing(0).dropX;
    const parked = typing(timing.run).dropX;
    const erased = poseAt(hello, flow, FONT, timing.total - 0.01).dropX;
    expect(start).toBeLessThan(hello.left);
    expect(parked).toBeGreaterThan(hello.left + hello.width);
    expect(erased).toBeCloseTo(start, 0);
  });

  test("the word is swallowed completely by the end of its cycle", () => {
    expect(poseAt(hello, flow, FONT, timing.total - 0.01).letters.every(letter => letter.scale === 0)).toBe(true);
  });

  test("the drop glides on from where the last word left it, so it never jumps", () => {
    const end = poseAt(flow, hello, FONT, phases(4).total - 0.01).dropX;
    expect(poseAt(hello, flow, FONT, 0).dropX).toBeCloseTo(end, 0);
  });

  test("a bloom overshoots once and lands at full size", () => {
    const samples = Array.from({ length: 50 }, (_, i) => bloom(i / 49));
    expect(Math.max(...samples)).toBeGreaterThan(1.02);
    expect(bloom(1)).toBe(1);
    expect(bloom(0)).toBe(0);
    expect(ease(0.5)).toBe(0.5);
  });
});
