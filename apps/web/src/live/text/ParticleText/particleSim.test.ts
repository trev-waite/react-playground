import { describe, expect, test } from "bun:test";
import {
  BURST_BRUSH,
  HINT_BRUSH,
  POINTER_BRUSH,
  applyBrush,
  frameScale,
  hintPosition,
  isDetached,
  particleDisplacement,
  particleLift,
  restingParticle,
  scaleBrush,
  stepParticle,
  type Brush,
  type Particle,
} from "./particleMath";
import { ParticleSim } from "./particleSim";

function hash01(value: number): number {
  const t = Math.sin(value) * 43758.5453123;
  return t - Math.floor(t);
}

/** A block of ink cells shaped roughly like a line of text. */
function glyphField(): Particle[] {
  const particles: Particle[] = [];
  for (let y = 0; y < 80; y += 2) {
    for (let x = 0; x < 400; x += 2) {
      if (Math.sin(x * 0.07) * Math.cos(y * 0.11) < -0.1) continue;
      particles.push(restingParticle(x, y, 1, hash01(x * 43.1 + y * 19.4), hash01(x * 91.3 + y * 17.8)));
    }
  }
  return particles;
}

/** The reference: every particle, every frame. */
class BruteForce {
  readonly lift: Float32Array;
  private readonly detached: Uint8Array;
  constructor(readonly particles: Particle[]) {
    this.lift = new Float32Array(particles.length);
    this.detached = new Uint8Array(particles.length);
  }
  step(dtMs: number, frame: number, unit: number, timeMs: number, brushes: readonly Brush[]) {
    this.particles.forEach((particle, i) => {
      for (const brush of brushes) applyBrush(particle, brush, frame);
      stepParticle(particle, dtMs, unit, timeMs);
      const detached = isDetached(particle, this.detached[i] === 1);
      this.detached[i] = detached ? 1 : 0;
      this.lift[i] = particleLift(particle, detached);
    });
  }
}

/** Settling snaps every particle exactly home, which would hide a divergence, so compare each frame. */
function firstMismatch(sim: ParticleSim, reference: BruteForce): string | null {
  for (let i = 0; i < reference.particles.length; i++) {
    const a = sim.particles[i]!;
    const b = reference.particles[i]!;
    if (a.x !== b.x || a.y !== b.y || a.vx !== b.vx || a.vy !== b.vy || a.hold !== b.hold || sim.lift[i] !== reference.lift[i]) {
      return `particle ${i}`;
    }
  }
  return null;
}

const pointer = (x: number, y: number, vx: number): Brush => ({ ...scaleBrush(POINTER_BRUSH, 1), x, y, vx, vy: 0 });

describe("ParticleSim", () => {
  test("stepping only disturbed particles matches stepping all of them exactly", () => {
    const reference = new BruteForce(glyphField());
    const sim = new ParticleSim(glyphField(), 24);
    const hint = { ...scaleBrush(HINT_BRUSH, 1), x: 12, y: 10, vx: 0, vy: 0 };
    let time = 0;
    for (let frame = 0; frame < 420; frame++) {
      const dt = 16 + (frame % 3);
      time += dt;
      const brushes: Brush[] = [];
      if (frame < 60) brushes.push(pointer(frame * 6, 40 + Math.sin(frame / 5) * 20, 0.4));
      hint.x = 12 + Math.sin(time / 500) * 4;
      brushes.push(hint);
      if (frame === 150) {
        const burst = { ...scaleBrush(BURST_BRUSH, 1), x: 300, y: 40, vx: 0, vy: 0 };
        for (const particle of reference.particles) applyBrush(particle, burst, 1);
        sim.impulse(burst);
      }
      reference.step(dt, frameScale(dt), 1, time, brushes);
      sim.step(dt, frameScale(dt), 1, time, brushes);
      expect(firstMismatch(sim, reference), `frame ${frame}`).toBeNull();
    }
  });

  test("an idle hint keeps only a handful of particles awake", () => {
    const sim = new ParticleSim(glyphField(), 24);
    const hint = { ...scaleBrush(HINT_BRUSH, 1), x: 12, y: 10, vx: 0, vy: 0 };
    for (let frame = 0; frame < 240; frame++) sim.step(16, 1, 1, frame * 16, [hint]);
    expect(sim.activeIndices.length).toBeGreaterThan(0);
    expect(sim.activeIndices.length).toBeLessThan(sim.particles.length / 20);
  });

  test("every lifted particle stays in the active set the renderer draws from", () => {
    const sim = new ParticleSim(glyphField(), 24);
    for (let frame = 0; frame < 30; frame++) sim.step(16, 1, 1, frame * 16, [pointer(100 + frame * 4, 40, 0.5)]);
    const active = new Set(sim.activeIndices);
    sim.lift.forEach((lift, i) => {
      if (lift > 0) expect(active.has(i)).toBe(true);
    });
  });

  test("once everything settles, nothing is left to step", () => {
    const sim = new ParticleSim(glyphField(), 24);
    sim.impulse({ ...scaleBrush(BURST_BRUSH, 1), x: 200, y: 40, vx: 0, vy: 0 });
    let frames = 0;
    while (sim.step(16, 1, 1, frames * 16, []).busy && frames < 2000) frames++;
    expect(frames).toBeLessThan(2000);
    expect(sim.activeIndices.length).toBe(0);
    expect(sim.particles.every(p => p.x === p.homeX && p.y === p.homeY)).toBe(true);
  });
});

describe("ParticleText look", () => {
  test("the idle hint shimmers in place and never sets ink adrift", () => {
    const sim = new ParticleSim(glyphField(), 24);
    const hint = { ...scaleBrush(HINT_BRUSH, 1), x: 0, y: 0, vx: 0, vy: 0 };
    let farthest = 0;
    for (let frame = 0; frame < 600; frame++) {
      Object.assign(hint, hintPosition({ x: 12, y: 10 }, frame * 16, 1));
      sim.step(16, 1, 1, frame * 16, [hint]);
      for (const i of sim.activeIndices) {
        const particle = sim.particles[i]!;
        farthest = Math.max(farthest, particleDisplacement(particle));
        expect(particle.hold).toBeLessThanOrEqual(0);
      }
    }
    expect(farthest).toBeGreaterThan(1);
    expect(farthest).toBeLessThan(8);
  });

  test("a sweep scatters a real share of the ink, and it all reforms within a few seconds", () => {
    const sim = new ParticleSim(glyphField(), 24);
    let frame = 0;
    for (; frame < 50; frame++) sim.step(16, 1, 1, frame * 16, [pointer(frame * 8, 40 + Math.sin(frame / 5) * 20, 0)]);
    for (; frame < 70; frame++) sim.step(16, 1, 1, frame * 16, []);
    const scattered = sim.particles.filter(particle => particleDisplacement(particle) > 10).length;
    expect(scattered / sim.particles.length).toBeGreaterThan(0.15);
    while (sim.step(16, 1, 1, frame * 16, []).busy && frame < 1000) frame++;
    expect((frame - 50) * 16).toBeLessThan(4000);
  });
});
