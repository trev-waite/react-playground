/** Distances below are tuned for text set at this size and scale with the actual font size. */
export const DESIGN_FONT_PX = 88;

export const LIFT_START_PX = 0.9;
export const LIFT_FULL_PX = 3;
const LIFT_REATTACH_PX = 0.45;
const GATE_SCALE = 0.55;
const GATE_SPAN = 0.25;
const CARRY = 2.2;
const DRIFT = 0.07;
const DAMPING_ADRIFT = 0.94;
const DAMPING_HOME = 0.76;
const SPRING = 0.05;
const RETURN_CURL = 0.45;
export const RETURN_RAMP_MS = 520;
const MAX_SPEED = 14;
const SETTLE_EPS = 0.12;
const HINT_WANDER_X = 4.5;
const HINT_WANDER_Y = 3.5;
const HINT_PERIOD_MS = 3200;
const HINT_INSET_X = 10;
const HINT_INSET_Y = 11;

export type Particle = {
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Milliseconds left adrift; once negative it counts how long the particle has been heading home. */
  hold: number;
  alpha: number;
  seed: number;
  gate: number;
};

export type BrushShape = {
  rx: number;
  ry: number;
  push: number;
  swirl: number;
  holdMs: number;
  holdSpreadMs: number;
};

export type Brush = BrushShape & { x: number; y: number; vx: number; vy: number };

export const POINTER_BRUSH: BrushShape = { rx: 30, ry: 38, push: 1.15, swirl: 0.7, holdMs: 260, holdSpreadMs: 620 };
/** No hold: the hint only leans particles against their spring, so they shimmer in place instead of drifting off. */
export const HINT_BRUSH: BrushShape = { rx: 11, ry: 13, push: 0.2, swirl: 0.08, holdMs: 0, holdSpreadMs: 0 };
export const BURST_BRUSH: BrushShape = { rx: 70, ry: 70, push: 7, swirl: 2.5, holdMs: 420, holdSpreadMs: 820 };

export function scaleBrush(shape: BrushShape, unit: number): BrushShape {
  return { ...shape, rx: shape.rx * unit, ry: shape.ry * unit, push: shape.push * unit, swirl: shape.swirl * unit };
}

export function restingParticle(homeX: number, homeY: number, alpha: number, seed: number, gate: number): Particle {
  return { homeX, homeY, x: homeX, y: homeY, vx: 0, vy: 0, hold: -RETURN_RAMP_MS, alpha, seed, gate };
}

/** Math.hypot guards against overflow at a large cost; these values are small, so a plain root is safe and several times faster. */
function length(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge0 ? 1 : 0;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function frameScale(dtMs: number): number {
  return Math.min(2.5, Math.max(0.25, dtMs / 16.67));
}

/** Strength of a brush on a particle where it is now; each particle's gate makes the edge ragged instead of a clean ellipse. */
export function brushInfluence(particle: Particle, brush: Brush): number {
  if (brush.rx <= 0 || brush.ry <= 0) return 0;
  const dist = length((particle.x - brush.x) / brush.rx, (particle.y - brush.y) / brush.ry);
  if (dist >= 1) return 0;
  const influence = smoothstep(0, 1, 1 - dist);
  const edge0 = Math.min(1, Math.max(0, particle.gate)) * GATE_SCALE;
  return influence * smoothstep(edge0, edge0 + GATE_SPAN, influence);
}

/** Blows particles out from the brush with a swirl, carries them along its stroke, and keeps them adrift for a while. */
export function applyBrush(particle: Particle, brush: Brush, frame: number): void {
  const influence = brushInfluence(particle, brush);
  if (influence <= 0) return;
  const dx = particle.x - brush.x;
  const dy = particle.y - brush.y;
  const dist = length(dx, dy);
  const nx = dist > 0.001 ? dx / dist : Math.cos(particle.seed * Math.PI * 2);
  const ny = dist > 0.001 ? dy / dist : Math.sin(particle.seed * Math.PI * 2);
  const push = brush.push * influence * frame;
  const swirl = brush.swirl * influence * frame;
  particle.vx += nx * push - ny * swirl + brush.vx * CARRY * influence;
  particle.vy += ny * push + nx * swirl + brush.vy * CARRY * influence;
  const hold = brush.holdMs + brush.holdSpreadMs * particle.seed;
  if (hold > 0) particle.hold = Math.max(particle.hold, hold);
}

function flowAngle(x: number, y: number, timeMs: number, seed: number): number {
  return (
    Math.sin(x * 0.045 + timeMs * 0.0011) * 2.4 +
    Math.cos(y * 0.06 - timeMs * 0.0008) * 2.4 +
    seed * Math.PI * 2
  );
}

function clampSpeed(particle: Particle, max: number) {
  const speed = length(particle.vx, particle.vy);
  if (speed <= max) return;
  particle.vx *= max / speed;
  particle.vy *= max / speed;
}

export function isResting(particle: Particle): boolean {
  return (
    particle.hold <= -RETURN_RAMP_MS &&
    particle.vx === 0 &&
    particle.vy === 0 &&
    particle.x === particle.homeX &&
    particle.y === particle.homeY
  );
}

/**
 * Adrift, a particle wanders on a slow flow field. Once its hold runs out a
 * spring eases in and pulls it home along a curl, so the glyph reforms in a
 * swirl rather than snapping back. Returns false once it is home and still.
 */
export function stepParticle(particle: Particle, dtMs: number, unit: number, timeMs: number): boolean {
  if (isResting(particle)) return false;
  const frame = frameScale(dtMs);
  let damping = DAMPING_ADRIFT;

  if (particle.hold > 0) {
    const angle = flowAngle(particle.x / unit, particle.y / unit, timeMs, particle.seed);
    particle.vx += Math.cos(angle) * DRIFT * unit * frame;
    particle.vy += Math.sin(angle) * DRIFT * unit * frame;
  } else {
    const ramp = smoothstep(0, RETURN_RAMP_MS, -particle.hold);
    const spring = SPRING * ramp * frame;
    const turn = particle.seed < 0.5 ? -1 : 1;
    const dx = particle.homeX - particle.x;
    const dy = particle.homeY - particle.y;
    particle.vx += (dx - dy * RETURN_CURL * turn) * spring;
    particle.vy += (dy + dx * RETURN_CURL * turn) * spring;
    damping = DAMPING_ADRIFT + (DAMPING_HOME - DAMPING_ADRIFT) * ramp;
  }

  particle.vx *= Math.pow(damping, frame);
  particle.vy *= Math.pow(damping, frame);
  clampSpeed(particle, MAX_SPEED * unit);
  particle.x += particle.vx * frame;
  particle.y += particle.vy * frame;
  particle.hold = Math.max(-RETURN_RAMP_MS, particle.hold - dtMs);

  if (
    particle.hold <= -RETURN_RAMP_MS &&
    particleDisplacement(particle) < SETTLE_EPS &&
    length(particle.vx, particle.vy) < SETTLE_EPS
  ) {
    particle.x = particle.homeX;
    particle.y = particle.homeY;
    particle.vx = 0;
    particle.vy = 0;
    return false;
  }
  return true;
}

export function particleDisplacement(particle: Particle): number {
  return length(particle.x - particle.homeX, particle.y - particle.homeY);
}

/** Detach and reattach at different distances so a particle near the glyph does not flicker. */
export function isDetached(particle: Particle, wasDetached: boolean): boolean {
  const displacement = particleDisplacement(particle);
  if (!wasDetached) return displacement >= LIFT_START_PX;
  return displacement >= LIFT_REATTACH_PX || length(particle.vx, particle.vy) >= LIFT_REATTACH_PX;
}

/** 0 while the particle is part of the glyph, 1 once it reads as a free dot. */
export function particleLift(particle: Particle, detached: boolean): number {
  if (!detached) return 0;
  return smoothstep(LIFT_START_PX, LIFT_FULL_PX, particleDisplacement(particle));
}

export function hintPosition(origin: { x: number; y: number }, timeMs: number, unit: number): { x: number; y: number } {
  const t = (timeMs / HINT_PERIOD_MS) * Math.PI * 2;
  return {
    x: origin.x + Math.sin(t) * HINT_WANDER_X * unit,
    y: origin.y + Math.cos(t * 0.85) * HINT_WANDER_Y * unit,
  };
}

/** The ink sample nearest the text's top-left corner, where the idle hint shimmers. */
export function hintOrigin(samples: readonly { x: number; y: number }[], unit = 1): { x: number; y: number } | null {
  if (samples.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  for (const sample of samples) {
    minX = Math.min(minX, sample.x);
    minY = Math.min(minY, sample.y);
  }
  const targetX = minX + HINT_INSET_X * unit;
  const targetY = minY + HINT_INSET_Y * unit;
  let nearest = samples[0]!;
  let nearestDist = Infinity;
  for (const sample of samples) {
    const dist = Math.hypot(sample.x - targetX, sample.y - targetY);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = sample;
    }
  }
  return { x: nearest.x, y: nearest.y };
}
