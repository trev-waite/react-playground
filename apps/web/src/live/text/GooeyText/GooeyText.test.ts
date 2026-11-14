import { describe, expect, test } from "bun:test";
import { LEAD, SNAP_DISTANCE, TYPE_STEP_MS, bloom, ease, layoutWord, phases, poseAt, tether } from "./timeline";

const FONT = 100;
const measure = (text: string) => text.length * 60;
const hello = layoutWord("hello", measure, 800);
const flow = layoutWord("flow", measure, 800);
const timing = phases(hello.letters.length);

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

describe("Gooey Text slime", () => {
  test("a letter is born blue, inside the drop, on a thick strand", () => {
    const born = typing(birth(0) + 10).letters[0]!;
    expect(born.ink).toBe(0);
    expect(born.strand).toBeGreaterThan(0.1);
    expect(born.scale).toBeGreaterThan(0.25);
  });

  test("the strand thins as the drop pulls away, then snaps and the letter turns black", () => {
    const strands: number[] = [];
    const inks: number[] = [];
    for (let ms = birth(0) + 1; ms < timing.type; ms += 8) {
      const first = typing(ms).letters[0]!;
      strands.push(first.strand);
      inks.push(first.ink);
    }
    const snap = strands.findIndex(width => width === 0);
    expect(snap).toBeGreaterThan(2);
    expect(strands[0]!).toBeGreaterThan(strands[snap - 1]! * 3);
    expect(strands.slice(snap).every(width => width === 0)).toBe(true);
    expect(inks[0]).toBe(0);
    expect(inks.at(-1)).toBe(1);
  });

  test("a letter stretches toward the drop while the strand holds it, and lets go when it snaps", () => {
    let pulledAt = birth(0);
    while (!(typing(pulledAt).letters[0]!.strand > 0 && typing(pulledAt).letters[0]!.strand < 0.15)) pulledAt += 1;
    const pulled = typing(pulledAt).letters[0]!;
    expect(pulled.strand).toBeGreaterThan(0);
    expect(pulled.stretch).toBeGreaterThan(1);
    expect(pulled.dx).toBeGreaterThan(0);
    const free = typing(timing.type - 1).letters[0]!;
    expect(free.stretch).toBeCloseTo(1, 3);
    expect(free.dx).toBeCloseTo(0, 1);
  });

  test("the snap happens at the same reach for every letter", () => {
    expect(SNAP_DISTANCE).toBeGreaterThan(0.3);
    const end = typing(timing.type - 1);
    expect(end.letters.every(letter => letter.strand === 0 && letter.ink === 1)).toBe(true);
  });

  test("a freed letter springs back from its stretch over a short beat instead of snapping straight", () => {
    const justFreed = tether(SNAP_DISTANCE + 0.02, 1);
    expect(justFreed.strand).toBe(0);
    expect(justFreed.stretch).toBeGreaterThan(1.2);
    expect(tether(SNAP_DISTANCE + 0.5, 1).stretch).toBeCloseTo(1, 1);
    expect(Math.abs(tether(SNAP_DISTANCE - 0.001, 1).stretch - tether(SNAP_DISTANCE + 0.001, 1).stretch)).toBeLessThan(0.01);
  });
});

describe("Gooey Text timeline", () => {
  test("the word is hidden while the drop glides in, and black and still while it holds", () => {
    expect(poseAt(hello, flow, FONT, 0).letters.every(letter => letter.scale === 0)).toBe(true);
    const held = poseAt(hello, flow, FONT, timing.glide + timing.type + 10);
    expect(held.still).toBe(true);
    expect(held.letters.every(letter => letter.scale === 1 && letter.ink === 1 && letter.strand === 0)).toBe(true);
  });

  test("letters are born left to right, each out of the drop as it leads past", () => {
    for (let i = 1; i < hello.letters.length; i++) {
      expect(birth(i)).toBeGreaterThan(birth(i - 1));
      const born = typing(birth(i));
      const letter = hello.letters[i]!;
      expect(Math.abs(born.dropX - (letter.left + letter.width / 2 + LEAD * FONT))).toBeLessThan(3);
    }
  });

  test("the drop keeps its momentum past each letter, slowing only at the ends", () => {
    const speeds: number[] = [];
    for (let ms = 1; ms < (hello.letters.length + 1) * TYPE_STEP_MS; ms += 4) speeds.push(typing(ms + 4).dropX - typing(ms).dropX);
    const middle = speeds.slice(Math.floor(speeds.length * 0.3), Math.floor(speeds.length * 0.7));
    expect(Math.min(...middle)).toBeGreaterThan(Math.max(...middle) * 0.98);
  });

  test("the drop types rightward, then erases leftward back to where it began", () => {
    const start = typing(0).dropX;
    const parked = typing(timing.type - 1).dropX;
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
