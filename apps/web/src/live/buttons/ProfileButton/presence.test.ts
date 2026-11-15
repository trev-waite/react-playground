import { describe, expect, test } from "bun:test";
import { geometry, type Point } from "./portal";
import { RING, beadOutline, beadPath, rimAt, ringAt } from "./presence";

const stage = { width: 560, height: 420 };
const avatar = { x: 280, y: 210 };
const g = geometry(stage, avatar, 44);
const dot = { x: avatar.x + 0.74 * 44, y: avatar.y + 0.74 * 44, radius: 0.18 * 44 };

const area = (points: Point[]) =>
  Math.abs(points.reduce((sum, p, i) => sum + p.x * points[(i + 1) % points.length]!.y - points[(i + 1) % points.length]!.x * p.y, 0)) / 2;
const fromAvatar = (p: Point) => Math.hypot(p.x - avatar.x, p.y - avatar.y);

describe("Profile Button presence bead", () => {
  test("before the flight it is the dot exactly", () => {
    for (const p of beadOutline(g, dot, 0)) expect(Math.hypot(p.x - dot.x, p.y - dot.y)).toBeCloseTo(dot.radius, 6);
  });

  test("it answers the press at once, already spreading a few frames in", () => {
    const spread = (t: number) => {
      const points = beadOutline(g, dot, t);
      return Math.max(...points.map(p => Math.hypot(p.x - dot.x, p.y - dot.y)));
    };
    expect(spread(0.05)).toBeGreaterThan(dot.radius * 1.15);
  });

  test("as it melts onto the rim it keeps the dot's area, and once bent onto the rim it stays out of the window", () => {
    for (const t of [0.1, 0.18, 0.25]) {
      const points = beadOutline(g, dot, t);
      expect(area(points) / (Math.PI * dot.radius * dot.radius)).toBeGreaterThan(0.85);
      expect(area(points) / (Math.PI * dot.radius * dot.radius)).toBeLessThan(1.15);
    }
    for (const t of [0.2, 0.25, 0.3]) expect(Math.min(...beadOutline(g, dot, t).map(fromAvatar))).toBeGreaterThan(rimAt(g, t));
  });

  test("once melted it hugs the rim, its inner edge one slimmer ring off the window", () => {
    const t = 0.5;
    const nearest = Math.min(...beadOutline(g, dot, t).map(fromAvatar));
    expect(nearest - rimAt(g, t)).toBeCloseTo(ringAt(t), 0);
    expect(ringAt(t)).toBeLessThan(RING);
  });

  test("riding out, it stays a bead, never a hairline, and never gathers more blue than the dot had", () => {
    for (const t of [0.42, 0.5, 0.6, 0.7]) {
      const points = beadOutline(g, dot, t);
      const radii = points.map(fromAvatar);
      expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(0.6 * dot.radius * 0.95);
      expect(area(points) / (Math.PI * dot.radius * dot.radius)).toBeLessThan(1.25);
    }
  });

  test("it stretches at once but bends into the rim's curve gently", () => {
    const tips = (t: number) => {
      const points = beadOutline(g, dot, t);
      const along = points.map(p => (p.x - dot.x) * Math.SQRT1_2 - (p.y - dot.y) * Math.SQRT1_2);
      return Math.max(...along) - Math.min(...along);
    };
    expect(tips(0.04)).toBeGreaterThan(2 * dot.radius * 1.1);
    const bowed = (t: number) => {
      const radii = beadOutline(g, dot, t).map(fromAvatar);
      return Math.max(...radii) - Math.min(...radii);
    };
    expect(bowed(0.06)).toBeGreaterThan(bowed(0.12) * 0.9);
  });

  test("it rides the rim out past every edge of the stage by the time the room has landed", () => {
    const outside = (p: Point) => p.x < 0 || p.y < 0 || p.x > stage.width || p.y > stage.height;
    expect(beadOutline(g, dot, 1).every(outside)).toBe(true);
  });

  test("it draws as one closed outline, and nothing once it has left the stage", () => {
    expect(beadPath(g, dot, 300)).toMatch(/^M[\d. -]+(L[\d. -]+)+Z$/);
    expect(beadPath(g, dot, 1000)).toBe("");
  });
});
