import { applyBrush, isDetached, isResting, particleLift, stepParticle, type Brush, type Particle } from "./particleMath";

export type SimFrame = { lifting: number; fullyLifted: number; busy: boolean };

/**
 * Steps only the particles that can change this frame: those already in
 * motion, plus resting ones inside a brush's reach, found through a grid over
 * their home positions. A resting particle no brush reaches would stay
 * exactly where it is, so skipping it gives the same result as stepping
 * every particle while costing only the disturbed few.
 */
export class ParticleSim {
  readonly lift: Float32Array;
  private readonly detached: Uint8Array;
  private readonly awake: Uint8Array;
  private readonly active: Int32Array;
  private activeCount = 0;
  private readonly minX: number;
  private readonly minY: number;
  private readonly cols: number;
  private readonly rows: number;
  private readonly cellStart: Int32Array;
  private readonly cellItems: Int32Array;

  constructor(
    readonly particles: readonly Particle[],
    private readonly cellSize: number,
  ) {
    const count = particles.length;
    this.lift = new Float32Array(count);
    this.detached = new Uint8Array(count);
    this.awake = new Uint8Array(count);
    this.active = new Int32Array(count);

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const particle of particles) {
      minX = Math.min(minX, particle.homeX);
      minY = Math.min(minY, particle.homeY);
      maxX = Math.max(maxX, particle.homeX);
      maxY = Math.max(maxY, particle.homeY);
    }
    this.minX = count ? minX : 0;
    this.minY = count ? minY : 0;
    this.cols = count ? Math.floor((maxX - minX) / cellSize) + 1 : 0;
    this.rows = count ? Math.floor((maxY - minY) / cellSize) + 1 : 0;

    this.cellStart = new Int32Array(this.cols * this.rows + 1);
    const cellOf = new Int32Array(count);
    particles.forEach((particle, i) => {
      const cell = this.cellIndex(particle.homeX, particle.homeY);
      cellOf[i] = cell;
      this.cellStart[cell + 1]!++;
    });
    for (let cell = 0; cell < this.cols * this.rows; cell++) {
      this.cellStart[cell + 1]! += this.cellStart[cell]!;
    }
    const fill = this.cellStart.slice(0, -1);
    this.cellItems = new Int32Array(count);
    for (let i = 0; i < count; i++) this.cellItems[fill[cellOf[i]!]!++] = i;

    particles.forEach((particle, i) => {
      if (!isResting(particle)) this.wakeParticle(i);
    });
  }

  /** The particles that moved or may move; every lifted particle is among them. */
  get activeIndices(): Int32Array {
    return this.active.subarray(0, this.activeCount);
  }

  /** Applies a one-off brush, such as a press burst, outside the frame loop. */
  impulse(brush: Brush) {
    this.wake(brush);
    for (let k = 0; k < this.activeCount; k++) applyBrush(this.particles[this.active[k]!]!, brush, 1);
  }

  step(dtMs: number, frame: number, unit: number, timeMs: number, brushes: readonly Brush[]): SimFrame {
    for (const brush of brushes) this.wake(brush);
    let lifting = 0;
    let fullyLifted = 0;
    let busy = false;
    let kept = 0;
    for (let k = 0; k < this.activeCount; k++) {
      const i = this.active[k]!;
      const particle = this.particles[i]!;
      for (const brush of brushes) applyBrush(particle, brush, frame);
      if (stepParticle(particle, dtMs, unit, timeMs)) busy = true;
      const detached = isDetached(particle, this.detached[i] === 1);
      this.detached[i] = detached ? 1 : 0;
      const lift = particleLift(particle, detached);
      this.lift[i] = lift;
      if (lift > 0) lifting++;
      if (lift >= 1) fullyLifted++;
      if (isResting(particle)) this.awake[i] = 0;
      else this.active[kept++] = i;
    }
    this.activeCount = kept;
    return { lifting, fullyLifted, busy };
  }

  private cellIndex(x: number, y: number): number {
    const col = Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.minX) / this.cellSize)));
    const row = Math.min(this.rows - 1, Math.max(0, Math.floor((y - this.minY) / this.cellSize)));
    return row * this.cols + col;
  }

  private wakeParticle(i: number) {
    if (this.awake[i]) return;
    this.awake[i] = 1;
    this.active[this.activeCount++] = i;
  }

  private wake(brush: Brush) {
    if (this.cols === 0) return;
    const left = Math.floor((brush.x - brush.rx - this.minX) / this.cellSize);
    const right = Math.floor((brush.x + brush.rx - this.minX) / this.cellSize);
    const top = Math.floor((brush.y - brush.ry - this.minY) / this.cellSize);
    const bottom = Math.floor((brush.y + brush.ry - this.minY) / this.cellSize);
    for (let row = Math.max(0, top); row <= Math.min(this.rows - 1, bottom); row++) {
      for (let col = Math.max(0, left); col <= Math.min(this.cols - 1, right); col++) {
        const cell = row * this.cols + col;
        for (let k = this.cellStart[cell]!; k < this.cellStart[cell + 1]!; k++) {
          const i = this.cellItems[k]!;
          const particle = this.particles[i]!;
          if (Math.abs(particle.homeX - brush.x) <= brush.rx && Math.abs(particle.homeY - brush.y) <= brush.ry) {
            this.wakeParticle(i);
          }
        }
      }
    }
  }
}
