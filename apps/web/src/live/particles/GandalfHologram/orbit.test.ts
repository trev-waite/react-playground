import { describe, expect, test } from "bun:test";
import { advanceOrbit, decayOrbit, dragAxis, orbitRadiansPerPixel, releaseSpeed, sampleFlick } from "./orbit";

describe("hologram orbit", () => {
  test("short stages do not amplify the same drag through a layout breakpoint", () => {
    const short = orbitRadiansPerPixel(148, 28);
    expect(orbitRadiansPerPixel(148, 72)).toBe(short);
    expect((8 * short * 180) / Math.PI).toBe(10);
    expect(orbitRadiansPerPixel(560, 528)).toBeLessThan(short);
  });

  test("waits through touch jitter and gives a vertical or tied sweep to paging", () => {
    for (const sign of [-1, 1]) {
      for (let x = 0; x < 8; x++) expect(dragAxis(sign * x, 4)).toBeNull();
      for (let x = 8; x <= 20; x++) {
        expect(dragAxis(sign * x, x - 1)).toBe("orbit");
        expect(dragAxis(sign * x, x)).toBe("scroll");
        expect(dragAxis(sign * x, x + 1)).toBe("scroll");
      }
    }
  });

  test("reserves vertical and diagonal touch drags starting on the hat for orbit", () => {
    for (const sign of [-1, 1]) {
      expect(dragAxis(0, sign * 7, true)).toBeNull();
      expect(dragAxis(0, sign * 8, true)).toBe("orbit");
      expect(dragAxis(sign * 12, sign * 16, true)).toBe("orbit");
    }
  });

  const origin = { x: 0, at: 0 };
  const start = { speed: 0, accepted: origin, peakX: 0 };

  test("throws in either direction and discards stale or excessive velocity", () => {
    for (const sign of [-1, 1]) {
      const slow = sampleFlick(start, origin, { x: sign * 4, at: 20 }, 0.01);
      const fast = sampleFlick(start, origin, { x: sign * 48, at: 4 }, 0.01);
      expect(releaseSpeed(slow, 24)).toBe(2 * sign);
      expect(releaseSpeed(fast, 24)).toBe(4.2 * sign);
      expect(releaseSpeed(fast, 90)).toBe(0);
    }
  });

  test("switches the throw to a short reversal from the visible peak", () => {
    for (const sign of [-1, 1]) {
      const reach = { x: sign * 72, at: 36 };
      const first = sampleFlick(start, origin, reach, 0.01);
      expect(Math.sign(first.speed)).toBe(sign);
      const short = sampleFlick(first, reach, { x: sign * 68, at: 48 }, 0.01);
      expect(Math.sign(releaseSpeed(short, 52))).toBe(-sign);
      expect(Math.sign(sampleFlick(first, reach, { x: sign * 68, at: 36 }, 0.01).speed)).toBe(-sign);

      const edge = { x: sign * 73.5, at: 40 };
      const peak = sampleFlick(first, reach, edge, 0.01);
      const small = { x: sign * 71, at: 44 };
      const jitter = sampleFlick(peak, edge, small, 0.01);
      expect(jitter).toBe(peak);
      const reversal = sampleFlick(jitter, small, { x: sign * 70.5, at: 48 }, 0.01);
      expect(Math.sign(releaseSpeed(reversal, 52))).toBe(-sign);
    }
  });

  test("micro-movements in either direction cannot refresh an old throw", () => {
    for (const sign of [-1, 1]) {
      const reach = { x: sign * 72, at: 36 };
      const fast = sampleFlick(start, origin, reach, 0.01);
      for (const direction of [-1, 1]) {
        const small = { x: reach.x + direction, at: 80 };
        const one = sampleFlick(fast, reach, small, 0.01);
        const two = sampleFlick(one, small, { x: reach.x + direction * 2, at: 124 }, 0.01);
        expect(releaseSpeed(two, 125)).toBe(0);
      }
    }
  });

  test("crossing the touch threshold at a crawl does not throw the sculpture", () => {
    const sensitivity = orbitRadiansPerPixel(144, 72);
    const atSlop = { x: 8, at: 1000 };
    const flick = sampleFlick(start, { x: 7, at: 875 }, atSlop, sensitivity);
    expect(releaseSpeed(flick, 1008)).toBe(0);
    expect(releaseSpeed(sampleFlick(start, origin, atSlop, sensitivity), 1008)).toBe(0);
    const paced = sampleFlick(start, { x: 7, at: 920 }, atSlop, sensitivity);
    expect((advanceOrbit(0, releaseSpeed(paced, 1008), 1) * 180) / Math.PI).toBeLessThan(2);
  });

  test("slow moves after orbit engages do not invent a flick", () => {
    const sensitivity = orbitRadiansPerPixel(144, 104);
    for (const step of [2, 3, 4]) {
      let previous = { x: 8, at: 120 };
      let flick = sampleFlick(start, origin, previous, sensitivity);
      for (let move = 1; move <= 4; move++) {
        const sample = { x: 8 + move * step, at: previous.at + 120 };
        flick = sampleFlick(flick, previous, sample, sensitivity);
        previous = sample;
      }
      expect(releaseSpeed(flick, previous.at + 12)).toBe(0);
    }
  });

  test("a flick after a hold uses the recent motion in either direction", () => {
    for (const direction of [-1, 1]) {
      const reach = { x: 64, at: 16 };
      const fast = sampleFlick(start, origin, reach, 0.01);
      for (const hold of [16, 250, 1000]) {
        const small = { x: reach.x + direction, at: reach.at + hold };
        const one = sampleFlick(fast, reach, small, 0.01);
        const flick = sampleFlick(one, small, { x: reach.x + 8 * direction, at: small.at + 20 }, 0.01);
        expect(releaseSpeed(flick, small.at + 24)).toBe(3.5 * direction);
        const single = sampleFlick(fast, reach, { x: reach.x + 8 * direction, at: reach.at + hold + 20 }, 0.01);
        if (hold > 85) expect(releaseSpeed(single, reach.at + hold + 24)).toBe(0);
      }
    }
  });

  test("settles at the same angle across different frame rates without reversing", () => {
    for (const sign of [-1, 1]) {
      const initialSpeed = 3 * sign;
      for (const fps of [30, 60, 120]) {
        let yaw = 0;
        let speed = initialSpeed;
        for (let frame = 0; frame < fps; frame++) {
          const next = advanceOrbit(yaw, speed, 1 / fps);
          expect(sign * next).toBeGreaterThan(sign * yaw);
          yaw = next;
          speed = decayOrbit(speed, 1 / fps);
        }
        expect(yaw).toBeCloseTo(advanceOrbit(0, initialSpeed, 1), 10);
        expect(Math.abs(speed)).toBeLessThan(0.002);
      }
    }
  });
});
