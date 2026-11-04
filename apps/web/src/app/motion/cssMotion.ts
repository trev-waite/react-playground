import { springGenerator } from "./generators";
import { REDUCED_MOTION, SPRING, type SpringTransition } from "./transitions";

/** One point of a spring's `linear()` curve per this many milliseconds. */
const SAMPLE_MS = 10;

const CSS_EASING = { linear: "linear", easeOut: "cubic-bezier(0, 0, 0.58, 1)" } as const;

const round = (value: number) => Math.round(value * 10000) / 10000;

/** A spring as CSS: its settle time and a `linear()` curve sampled from the engine's own generator. */
export function springCss(spring: SpringTransition): { duration: string; easing: string } {
  const curve = springGenerator(0, 1, spring, 0);
  const steps = Math.max(2, Math.round(curve.duration / SAMPLE_MS));
  const points = Array.from({ length: steps + 1 }, (_, i) => round(curve.value((i / steps) * curve.duration)));
  return { duration: `${curve.duration}ms`, easing: `linear(${points.join(", ")})` };
}

/**
 * The motion vocabulary as CSS custom properties, so CSS transitions move on
 * the same springs as the JS-driven chrome: `--spring-<name>-duration` and
 * `--spring-<name>-easing` for each spring, plus `--reduced-motion-*`.
 */
export function motionProperties(): Record<string, string> {
  const properties: Record<string, string> = {
    "--reduced-motion-duration": `${REDUCED_MOTION.duration * 1000}ms`,
    "--reduced-motion-easing": CSS_EASING[REDUCED_MOTION.ease],
  };
  for (const [name, spring] of Object.entries(SPRING)) {
    const { duration, easing } = springCss(spring);
    properties[`--spring-${name}-duration`] = duration;
    properties[`--spring-${name}-easing`] = easing;
  }
  return properties;
}

export function installMotionProperties(root: HTMLElement) {
  for (const [property, value] of Object.entries(motionProperties())) root.style.setProperty(property, value);
}
