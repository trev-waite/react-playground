import { describe, expect, test } from "bun:test";
import { geometry, type Point } from "./portal";
import { RING, beadAt, beadOutline, rimAt, ringAt } from "./presence";

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
    expect(beadAt(g, dot, 300).path).toMatch(/^M[\d. -]+(L[\d. -]+)+Z$/);
    expect(beadAt(g, dot, 1000).path).toBe("");
  });

  test("under the pointer it melts onto the avatar's rim as it would in flight, keeping the dot's area", () => {
    const hovered = beadOutline(g, dot, 0, 1);
    expect(Math.min(...hovered.map(fromAvatar)) - g.avatarRadius).toBeCloseTo(ringAt(0, 1), 0);
    expect(area(hovered) / (Math.PI * dot.radius * dot.radius)).toBeGreaterThan(0.85);
    expect(area(hovered) / (Math.PI * dot.radius * dot.radius)).toBeLessThan(1.25);
    const along = hovered.map(p => (p.x - dot.x) * Math.SQRT1_2 - (p.y - dot.y) * Math.SQRT1_2);
    expect(Math.max(...along) - Math.min(...along)).toBeGreaterThan(2 * dot.radius * 2.5);
  });

  test("a flight goes on from the melted bead without a jump, whatever share it had melted", () => {
    for (const held of [0, 0.3, 1]) {
      const from = beadOutline(g, dot, 0, held);
      const next = beadOutline(g, dot, 0.016, held);
      for (let i = 0; i < from.length; i++) expect(Math.hypot(next[i]!.x - from[i]!.x, next[i]!.y - from[i]!.y)).toBeLessThan(dot.radius * 0.4);
    }
  });

  test("melting under the pointer is the flight's own melt, so it is all one shape once the flight has melted", () => {
    const flown = beadOutline(g, dot, 0.5);
    beadOutline(g, dot, 0.5, 1).forEach((p, i) => {
      expect(p.x).toBeCloseTo(flown[i]!.x, 6);
      expect(p.y).toBeCloseTo(flown[i]!.y, 6);
    });
  });

  test("drawn in the window's space, the window's own scale carries it onto its outline", () => {
    for (const ms of [0, 150, 300, 450]) {
      const t = ms / 1000;
      const scale = rimAt(g, t) / g.reach;
      const bead = beadAt(g, dot, ms);
      const drawn = bead.path
        .slice(1, -1)
        .split("L")
        .map(pair => pair.split(" ").map(Number) as [number, number])
        .map(([x, y]) => ({ x: avatar.x + (x - g.reach) * scale, y: avatar.y + (y - g.reach) * scale }));
      beadOutline(g, dot, t).forEach((p, i) => {
        expect(drawn[i]!.x).toBeCloseTo(p.x, 1);
        expect(drawn[i]!.y).toBeCloseTo(p.y, 1);
      });
      expect(bead.stroke * scale).toBeCloseTo(ringAt(t) * 2, 2);
    }
  });
});
