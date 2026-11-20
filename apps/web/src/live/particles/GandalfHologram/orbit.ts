const FRICTION = 8;
const MAX_THROW = 4.2;
const MAX_SAMPLE_AGE = 85;
const SAMPLE_DISTANCE = 3;

export const FRONT_YAW = 0.095;
export const FRONT_PITCH = 0.16;
export const TURN_STEP = Math.PI / 6;

export function orbitRadiansPerPixel(width: number, height: number) {
  return Math.PI / Math.max(144, Math.min(width, height * 0.77, 430));
}

export function dragAxis(x: number, y: number, onHat = false) {
  if (Math.max(Math.abs(x), Math.abs(y)) < 8) return null;
  return onHat || Math.abs(x) > Math.abs(y) ? "orbit" : "scroll";
}

export type PointerSample = { x: number; at: number };
export type Flick = { speed: number; accepted: PointerSample; peakX: number };

export function sampleFlick(
  flick: Flick,
  previous: PointerSample,
  sample: PointerSample,
  radiansPerPixel: number,
): Flick {
  const fromPeak = sample.x - flick.peakX;
  const reversal = fromPeak * flick.speed < 0;
  const distance = reversal ? fromPeak : sample.x - flick.accepted.x;
  if (Math.abs(distance) < SAMPLE_DISTANCE) {
    return fromPeak * flick.speed > 0 ? { ...flick, peakX: sample.x } : flick;
  }

  const delta = sample.x - previous.x;
  const elapsed = sample.at - previous.at;
  const speed = elapsed > MAX_SAMPLE_AGE ? 0 : (delta * radiansPerPixel * 1000) / Math.max(12, elapsed);
  return { speed, accepted: sample, peakX: sample.x };
}

export function releaseSpeed(flick: Flick, at: number) {
  return at - flick.accepted.at > MAX_SAMPLE_AGE ? 0 : Math.max(-MAX_THROW, Math.min(MAX_THROW, flick.speed));
}

export function advanceOrbit(yaw: number, velocity: number, seconds: number) {
  const decay = Math.exp(-FRICTION * seconds);
  return yaw + velocity * (1 - decay) / FRICTION;
}

export function decayOrbit(velocity: number, seconds: number) {
  return velocity * Math.exp(-FRICTION * seconds);
}
