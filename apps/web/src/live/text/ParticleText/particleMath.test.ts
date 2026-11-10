import { describe, expect, test } from "bun:test";
import {
  HINT_BRUSH,
  LIFT_FULL_PX,
  LIFT_START_PX,
  POINTER_BRUSH,
  applyBrush,
  brushInfluence,
  hintOrigin,
  isDetached,
  isResting,
  particleDisplacement,
  particleLift,
  restingParticle,
  scaleBrush,
  stepParticle,
  type Brush,
  type Particle,
} from "./particleMath";

function particle(overrides: Partial<Particle> = {}): Particle {
  return { ...restingParticle(50, 20, 1, 0.3, 0), ...overrides };
}

function pointerAt(x: number, y: number, unit = 1): Brush {
  return { ...scaleBrush(POINTER_BRUSH, unit), x, y, vx: 0, vy: 0 };
}

function settle(p: Particle, maxFrames = 2000): number {
  let frames = 0;
  let time = 0;
  while (stepParticle(p, 16, 1, (time += 16)) && frames < maxFrames) frames++;
  return frames;
}

describe("ParticleText math", () => {
  test("the brush reaches only inside its ellipse", () => {
    const brush = pointerAt(50, 20);
    expect(brushInfluence(particle(), brush)).toBeCloseTo(1, 5);
    expect(brushInfluence(particle({ x: 50 + brush.rx }), brush)).toBe(0);
    expect(brushInfluence(particle({ y: 20 + brush.ry }), brush)).toBe(0);
  });

  test("the brush scales with the font size", () => {
    const small = pointerAt(0, 0, 0.5);
    expect(small.rx).toBe(POINTER_BRUSH.rx / 2);
    expect(brushInfluence(particle({ x: POINTER_BRUSH.rx * 0.75, y: 0 }), small)).toBe(0);
  });

  test("a brushed particle is blown outward, swirls, and is held adrift", () => {
    const p = particle({ x: 60 });
    applyBrush(p, pointerAt(50, 20), 1);
    expect(p.vx).toBeGreaterThan(0);
    expect(p.vy).not.toBe(0);
    expect(p.hold).toBeGreaterThan(0);
    expect(isResting(p)).toBe(false);
  });

  test("a scattered particle drifts away first, then reforms exactly at home", () => {
    const p = particle({ x: 60 });
    applyBrush(p, pointerAt(50, 20), 1);
    for (let i = 0; i < 10; i++) stepParticle(p, 16, 1, i * 16);
    expect(particleDisplacement(p)).toBeGreaterThan(LIFT_FULL_PX);
    expect(settle(p)).toBeLessThan(2000);
    expect(p.x).toBe(p.homeX);
    expect(p.y).toBe(p.homeY);
    expect(isResting(p)).toBe(true);
  });

  test("the idle hint nudges particles without setting them adrift", () => {
    const p = particle({ x: 52 });
    applyBrush(p, { ...HINT_BRUSH, x: 50, y: 20, vx: 0, vy: 0 }, 1);
    expect(p.vx).toBeGreaterThan(0);
    expect(p.hold).toBeLessThanOrEqual(0);
  });

  test("a resting particle costs nothing to step", () => {
    const p = particle();
    expect(stepParticle(p, 16, 1, 0)).toBe(false);
    expect(p).toEqual(particle());
  });

  test("detachment uses hysteresis so particles near the glyph do not flicker", () => {
    const p = particle({ x: 50 + LIFT_START_PX * 0.8 });
    expect(isDetached(p, false)).toBe(false);
    expect(isDetached(p, true)).toBe(true);
    expect(particleLift(particle({ x: 50 + LIFT_FULL_PX }), true)).toBe(1);
    expect(particleLift(p, false)).toBe(0);
  });

  test("the hint sits on the ink sample nearest the top-left corner", () => {
    const samples = [
      { x: 0, y: 40 },
      { x: 10, y: 10 },
      { x: 200, y: 10 },
    ];
    expect(hintOrigin(samples)).toEqual({ x: 10, y: 10 });
    expect(hintOrigin([])).toBeNull();
  });
});
