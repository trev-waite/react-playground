import { describe, expect, test } from "bun:test";
import { approach, clampCenter, cloneTransform, driftAt, follow, grabOffset, heldAt, lensPart, LENS_SHAPE, MIN_GRIP, type Point } from "./lens";

function parse(transform: string) {
  const [, x, y, scale] = /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([\d.]+)\)/.exec(transform)!;
  return { x: Number(x), y: Number(y), scale: Number(scale) };
}

const CENTER = { x: 200, y: 150 };
const AXIS = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
const ACROSS = { x: -Math.SQRT1_2, y: Math.SQRT1_2 };

/** A point `along` the handle's axis from the glass's center and `across` it, toward the lower left. */
function onAxis(along: number, across = 0): Point {
  return { x: CENTER.x + AXIS.x * along + ACROSS.x * across, y: CENTER.y + AXIS.y * along + ACROSS.y * across };
}

describe("Quote Lens", () => {
  test("the glass, its rim, and its handle can each be taken, and nothing just beyond them", () => {
    const radius = 80;
    const part = (point: Point) => lensPart(point, CENTER, radius);
    expect(part(CENTER)).toBe("glass");
    expect(part({ x: CENTER.x - 79, y: CENTER.y })).toBe("glass");
    expect(part({ x: CENTER.x - 85, y: CENTER.y })).toBe("rim");
    expect(part({ x: CENTER.x, y: CENTER.y - 87 })).toBe("rim");
    expect(part({ x: CENTER.x, y: CENTER.y - 89 })).toBeNull();
    expect(part({ x: CENTER.x - 89, y: CENTER.y })).toBeNull();
    expect(part(onAxis(radius * 1.5))).toBe("handle");
    expect(part(onAxis(radius * LENS_SHAPE.handle.to))).toBe("handle");
    expect(part(onAxis(radius * LENS_SHAPE.handle.to + 21))).toBe("handle");
    expect(part(onAxis(radius * LENS_SHAPE.handle.to + 23))).toBeNull();
    expect(part(onAxis(radius * 1.2, -40))).toBeNull();
    expect(part(onAxis(radius * 1.8, 40))).toBeNull();
  });

  test("a thin handle is still a 44 pixel target across, and a thick one is as wide as it is drawn", () => {
    const thin = 80;
    expect(thin * LENS_SHAPE.handle.halfWidth * 2).toBeLessThan(MIN_GRIP);
    expect(lensPart(onAxis(thin * 1.9, MIN_GRIP / 2 - 1), CENTER, thin)).toBe("handle");
    expect(lensPart(onAxis(thin * 1.9, -(MIN_GRIP / 2 - 1)), CENTER, thin)).toBe("handle");
    expect(lensPart(onAxis(thin * 1.9, MIN_GRIP / 2 + 1), CENTER, thin)).toBeNull();
    const thick = 200;
    const drawn = thick * LENS_SHAPE.handle.halfWidth;
    expect(drawn).toBeGreaterThan(MIN_GRIP / 2);
    expect(lensPart(onAxis(thick * 1.9, drawn - 1), CENTER, thick)).toBe("handle");
    expect(lensPart(onAxis(thick * 1.9, drawn + 1), CENTER, thick)).toBeNull();
    expect(lensPart(onAxis(thin * 1.9, MIN_GRIP / 2 + 1), CENTER, thin, MIN_GRIP * 2)).toBe("handle");
  });

  test("a glass taken anywhere keeps where it was taken, so it never jumps to the hand", () => {
    const page = { width: 800, height: 400 };
    for (const hand of [CENTER, onAxis(150), { x: CENTER.x + 84, y: CENTER.y }]) {
      const offset = grabOffset(CENTER, hand);
      expect(heldAt(hand, offset, page)).toEqual(CENTER);
      const moved = heldAt({ x: hand.x + 30, y: hand.y - 12 }, offset, page);
      expect(moved.x).toBeCloseTo(CENTER.x + 30, 9);
      expect(moved.y).toBeCloseTo(CENTER.y - 12, 9);
    }
  });

  test("a held glass stops at the page's edge and picks up the hand again on its way back", () => {
    const page = { width: 800, height: 400 };
    const hand = onAxis(150);
    const offset = grabOffset(CENTER, hand);
    expect(heldAt({ x: hand.x + 2000, y: hand.y + 2000 }, offset, page)).toEqual({ x: 800, y: 400 });
    expect(heldAt({ x: hand.x - 2000, y: hand.y - 2000 }, offset, page)).toEqual({ x: 0, y: 0 });
    const back = heldAt({ x: hand.x + 10, y: hand.y + 10 }, offset, page);
    expect(back.x).toBeCloseTo(CENTER.x + 10, 9);
    expect(back.y).toBeCloseTo(CENTER.y + 10, 9);
  });

  test("the page point under the lens's center stays at the center, magnified around it", () => {
    for (const center of [{ x: 0, y: 0 }, { x: 120, y: 80 }, { x: 512.5, y: 301.25 }]) {
      const radius = 70;
      const { x, y, scale } = parse(cloneTransform(center, radius, 1.6));
      expect(center.x * scale + x).toBeCloseTo(radius, 1);
      expect(center.y * scale + y).toBeCloseTo(radius, 1);
      const beside = { x: center.x + 10, y: center.y };
      expect(beside.x * scale + x - radius).toBeCloseTo(16, 1);
    }
  });

  test("the lens never leaves the page, and its drift stays over the middle of it", () => {
    const page = { width: 600, height: 300 };
    expect(clampCenter({ x: -40, y: 900 }, page)).toEqual({ x: 0, y: 300 });
    for (let seconds = 0; seconds < 90; seconds += 0.5) {
      const { x, y } = driftAt(seconds, page);
      expect(x).toBeGreaterThanOrEqual(page.width * 0.2);
      expect(x).toBeLessThanOrEqual(page.width * 0.8);
      expect(y).toBeGreaterThanOrEqual(page.height * 0.32);
      expect(y).toBeLessThanOrEqual(page.height * 0.6);
    }
  });

  test("following closes the same gap whatever the frame rate", () => {
    let fast = { x: 0, y: 0 };
    for (let frame = 0; frame < 8; frame++) fast = follow(fast, { x: 10, y: 0 }, 1 / 120, 14);
    let slow = { x: 0, y: 0 };
    for (let frame = 0; frame < 4; frame++) slow = follow(slow, { x: 10, y: 0 }, 1 / 60, 14);
    expect(fast.x).toBeCloseTo(slow.x, 6);
  });

  test("zooming eases the strength toward its target and never overshoots", () => {
    let scale = 1.6;
    for (let frame = 0; frame < 120; frame++) {
      const next = approach(scale, 2.4, 1 / 60, 12);
      expect(next).toBeGreaterThanOrEqual(scale);
      expect(next).toBeLessThanOrEqual(2.4);
      scale = next;
    }
    expect(scale).toBeCloseTo(2.4, 3);
  });
});
