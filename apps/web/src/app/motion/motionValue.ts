import { frame, now } from "./frameLoop";
import { isSpring, springGenerator, tweenGenerator, type Generator } from "./generators";
import type { Transition } from "./transitions";

/** Velocity is read from the last two frames, and counts as 0 once a value has sat this long. */
const MAX_VELOCITY_DELTA = 30;

/**
 * A number that animates outside React. Subscribers hear every change and
 * typically schedule a style write for the frame's render step.
 */
export class MotionValue {
  private current: number;
  private updatedAt: number;
  private prevFrameValue: number | undefined;
  private prevUpdatedAt: number | undefined;
  private listeners = new Set<(value: number) => void>();
  animation: Animation | undefined;

  constructor(initial: number) {
    this.current = initial;
    this.updatedAt = now();
  }

  get(): number {
    return this.current;
  }

  set(value: number) {
    const time = now();
    if (this.updatedAt !== time) {
      this.prevFrameValue = this.current;
      this.prevUpdatedAt = this.updatedAt;
    }
    const previous = this.current;
    this.current = value;
    this.updatedAt = time;
    if (value !== previous) for (const listener of this.listeners) listener(value);
  }

  /** Sets the value without animating, cancelling any animation and clearing velocity. */
  jump(value: number) {
    this.set(value);
    this.prevFrameValue = this.prevUpdatedAt = undefined;
    this.stop();
  }

  /** Units per second over the last frame. */
  getVelocity(): number {
    if (this.prevFrameValue === undefined || this.prevUpdatedAt === undefined) return 0;
    if (now() - this.updatedAt > MAX_VELOCITY_DELTA) return 0;
    const delta = Math.min(this.updatedAt - this.prevUpdatedAt, MAX_VELOCITY_DELTA);
    return delta ? (this.current - this.prevFrameValue) * (1000 / delta) : 0;
  }

  /** Brings the value up to the present and stops its animation where it is. */
  stop() {
    this.animation?.stop();
  }

  isUpdatedNow(): boolean {
    return this.updatedAt === now();
  }

  on(listener: (value: number) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

/**
 * One value's flight. It samples its curve on each frame's update step from
 * the time it was started, so a value retargeted mid-flight continues from
 * where it is. `finished` resolves when it lands, never when it is stopped.
 */
export class Animation {
  readonly finished: Promise<void>;
  private resolve!: () => void;
  private startTime = now();
  private running = true;

  constructor(
    private readonly value: MotionValue,
    private readonly generator: Generator,
    private readonly target: number,
    private readonly onUpdate?: (value: number) => void,
  ) {
    this.finished = new Promise(resolve => (this.resolve = resolve));
    value.animation = this;
    frame.update(this.tick);
  }

  private tick = (timestamp: number) => {
    if (!this.running) return;
    this.startTime = Math.min(this.startTime, timestamp);
    const elapsed = Math.round(timestamp - this.startTime);
    const done = elapsed >= this.generator.duration;
    const latest = done ? this.target : this.generator.value(elapsed);
    this.value.set(latest);
    this.onUpdate?.(latest);
    if (done) this.end().resolve();
    else if (this.running) frame.update(this.tick);
  };

  private end() {
    this.running = false;
    frame.cancel(this.tick);
    if (this.value.animation === this) this.value.animation = undefined;
    return this;
  }

  /** Lands on the target now rather than on the next frame. */
  land() {
    if (this.running) this.tick(now());
  }

  stop() {
    if (!this.running) return;
    if (!this.value.isUpdatedNow()) this.tick(now());
    if (this.running) this.end();
  }
}

type AnimateOptions = Transition & {
  onUpdate?: (value: number) => void;
  onComplete?: () => void;
};

/**
 * Animates a motion value, or a plain number through `onUpdate`, to `target`.
 * A running animation on the value is stopped first, and the new one starts
 * from its current value (and, for physics springs, its current velocity).
 */
export function animate(subject: MotionValue | number, target: number, options: AnimateOptions): Animation {
  const value = typeof subject === "number" ? new MotionValue(subject) : subject;
  const { onUpdate, onComplete, ...transition } = options;
  value.stop();
  const from = value.get();
  const velocity = value.getVelocity();
  const spring = isSpring(transition);

  const instant = !spring && transition.duration === 0;
  let generator: Generator;
  if (instant) {
    generator = { duration: 0, value: () => target };
  } else if (from === target && !(spring && velocity)) {
    value.set(target);
    onUpdate?.(target);
    generator = { duration: 0, value: () => target };
  } else {
    generator = spring
      ? springGenerator(from, target, transition, velocity)
      : tweenGenerator(from, target, transition);
  }

  const animation = new Animation(value, generator, target, onUpdate);
  if (instant) animation.land();
  if (onComplete) void animation.finished.then(onComplete);
  return animation;
}
