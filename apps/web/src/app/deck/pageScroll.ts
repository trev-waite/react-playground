import { frame, now } from "../motion/frameLoop";

/** How long a glide to a page takes, whatever the speed it starts with. Matches the morph's feel. */
export const GLIDE_MS = 480;

/** How tightly a pulled page follows wheel and trackpad input. Critically damped, so it never overshoots. */
const FOLLOW_STIFFNESS = 700;

/** Pulling past the first or last page meets this much resistance. */
export const EDGE_PULL = 0.3;

/** Scroll travel that commits to the next page: about an eighth of a page. */
export function commitDistance(pageHeight: number): number {
  return Math.min(140, Math.max(64, pageHeight * 0.12));
}

/**
 * The speed a glide starts with, in px/s. It keeps the page's own speed so the
 * hand-over is seamless, but never starts backwards, and is capped so a hard
 * flick cannot overshoot or race far ahead of a gentle scroll.
 */
export function glideStartVelocity(velocity: number, distance: number): number {
  if (distance === 0) return 0;
  const direction = Math.sign(distance);
  const max = (2 * Math.abs(distance)) / (GLIDE_MS / 1000);
  return direction * Math.min(max, Math.max(0, velocity * direction));
}

type Path = { position: (ms: number) => number; velocity: (ms: number) => number };

/**
 * A quintic from `from` (moving at `velocity` px/s) to rest at `to` over `ms`.
 * It eases in and out with no step in speed or acceleration: from rest, speed
 * rises and falls in a smooth bell; handed a speed, it carries on from it.
 */
export function glidePath(from: number, velocity: number, to: number, ms: number): Path {
  const duration = ms / 1000;
  const distance = to - from;
  const v = velocity * duration;
  const progress = (t: number) => Math.min(1, Math.max(0, t / ms));
  return {
    position: t => {
      const u = progress(t);
      const u3 = u * u * u;
      return from + distance * u3 * (10 - 15 * u + 6 * u * u) + v * (u - u3 * (6 - 8 * u + 3 * u * u));
    },
    velocity: t => {
      const u = progress(t);
      const u2 = u * u;
      return (distance * 30 * u2 * (1 - u) * (1 - u) + v * (1 - u2 * (18 - 32 * u + 15 * u2))) / duration;
    },
  };
}

/**
 * Scrolls the page column. A pull follows input through a critically damped
 * spring; a glide runs a `glidePath` from wherever the page is and however
 * fast it moves, so following, gliding, and retargeting join without a jolt.
 */
export class PageScroll {
  private position = 0;
  private velocity = 0;
  private target = 0;
  private path: Path | null = null;
  private pathStart = 0;
  private running = false;
  private last = 0;

  constructor(
    private readonly write: (top: number) => void,
    private readonly onSettle: () => void,
  ) {}

  get moving(): boolean {
    return this.running;
  }

  /** Picks up from the page's scroll, unless this is already moving it. */
  sync(top: number) {
    if (this.moving) return;
    this.position = top;
    this.velocity = 0;
  }

  follow(target: number) {
    this.path = null;
    this.target = target;
    this.start();
  }

  glide(target: number) {
    this.target = target;
    this.path = glidePath(this.position, glideStartVelocity(this.velocity, target - this.position), target, GLIDE_MS);
    this.pathStart = now();
    this.start();
  }

  stop() {
    frame.cancel(this.tick);
    this.running = false;
    this.path = null;
    this.velocity = 0;
  }

  private start() {
    if (this.running) return;
    this.running = true;
    this.last = now();
    frame.update(this.tick);
  }

  private tick = (timestamp: number) => {
    const dt = Math.min(0.05, Math.max(0, (timestamp - this.last) / 1000));
    this.last = timestamp;
    let settled = false;
    if (this.path) {
      const elapsed = timestamp - this.pathStart;
      if (elapsed >= GLIDE_MS) {
        this.position = this.target;
        this.velocity = 0;
        this.path = null;
        settled = true;
      } else {
        this.position = this.path.position(elapsed);
        this.velocity = this.path.velocity(elapsed);
      }
    } else {
      // Exact critically damped step toward a target held still for the frame.
      const omega = Math.sqrt(FOLLOW_STIFFNESS);
      const offset = this.position - this.target;
      const decay = Math.exp(-omega * dt);
      const drift = (this.velocity + omega * offset) * dt;
      this.position = this.target + (offset + drift) * decay;
      this.velocity = (this.velocity - omega * drift) * decay;
      if (Math.abs(this.position - this.target) < 0.5 && Math.abs(this.velocity) < 5) {
        this.position = this.target;
        this.velocity = 0;
      }
    }
    this.write(this.position);
    this.running = Boolean(this.path) || this.position !== this.target || this.velocity !== 0;
    if (this.running) frame.update(this.tick);
    if (settled) this.onSettle();
  };
}
