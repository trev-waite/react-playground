export type ValueScale = {
  min: number;
  max: number;
  step?: number;
  /** Map 0–1 track position → value. Defaults to linear interpolation. */
  toValue?: (t: number) => number;
  /** Map value → 0–1 track position. Defaults to inverse linear. */
  fromValue?: (value: number) => number;
  format?: (value: number) => string;
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function unlerp(a: number, b: number, value: number): number {
  if (a === b) return 0;
  return (value - a) / (b - a);
}

export function applyStep(value: number, min: number, max: number, step?: number): number {
  const clamped = clamp(value, min, max);
  if (step == null || step <= 0) return clamped;
  const stepped = min + Math.round((clamped - min) / step) * step;
  return clamp(stepped, min, max);
}

function defaultToValue(min: number, max: number, t: number): number {
  return lerp(min, max, clamp(t, 0, 1));
}

function defaultFromValue(min: number, max: number, value: number): number {
  return clamp(unlerp(min, max, value), 0, 1);
}

export function defaultFormat(value: number, step?: number): string {
  if (step != null && step >= 1 && Number.isInteger(step)) {
    return String(Math.round(value));
  }
  if (Number.isInteger(value)) return String(value);
  const abs = Math.abs(value);
  if (abs >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

export function linearScale(min: number, max: number, step?: number): ValueScale {
  return { min, max, step };
}

export function logScale(min: number, max: number, step?: number): ValueScale {
  if (!(min > 0) || !(max > 0)) {
    throw new Error("logScale requires min and max to be greater than 0");
  }
  const logMin = Math.log(min);
  const logRange = Math.log(max) - logMin;
  return {
    min,
    max,
    step,
    toValue: t => Math.exp(logMin + clamp(t, 0, 1) * logRange),
    fromValue: value => clamp((Math.log(clamp(value, min, max)) - logMin) / logRange, 0, 1),
  };
}

/** Gaussian falloff: 1 at the pointer, approaching 0 with distance. */
export function proximityGain(distance: number, sigma: number): number {
  if (sigma <= 0) return distance === 0 ? 1 : 0;
  return Math.exp(-(distance * distance) / (2 * sigma * sigma));
}

export function resolveValue(
  t: number,
  scale: Pick<ValueScale, "min" | "max" | "step" | "toValue">,
): number {
  const raw = scale.toValue ? scale.toValue(clamp(t, 0, 1)) : defaultToValue(scale.min, scale.max, t);
  return applyStep(raw, scale.min, scale.max, scale.step);
}

export function resolvePosition(
  value: number,
  scale: Pick<ValueScale, "min" | "max" | "fromValue">,
): number {
  if (scale.fromValue) return clamp(scale.fromValue(value), 0, 1);
  return defaultFromValue(scale.min, scale.max, value);
}
