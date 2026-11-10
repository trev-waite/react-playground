import { describe, expect, test } from "bun:test";
import { commitDistance, GLIDE_MS, glidePath, glideStartVelocity } from "./pageScroll";

const PAGE = 800;
const FRAME = 1000 / 60;

/** A glide from a pull of `pulled` px moving at `speed` px/s, sampled every frame. */
function glide(pulled: number, speed: number) {
  const path = glidePath(pulled, glideStartVelocity(speed, PAGE - pulled), PAGE, GLIDE_MS);
  const frames: { position: number; velocity: number }[] = [];
  for (let t = 0; t <= GLIDE_MS; t += FRAME) frames.push({ position: path.position(t), velocity: path.velocity(t) });
  return { path, frames };
}

describe("page scroll", () => {
  test("commits after about an eighth of a page, within limits", () => {
    expect(commitDistance(800)).toBeCloseTo(96);
    expect(commitDistance(300)).toBe(64);
    expect(commitDistance(2000)).toBe(140);
  });

  test("a glide starts at the page's own speed, never backwards, and capped", () => {
    expect(glideStartVelocity(900, 700)).toBe(900);
    expect(glideStartVelocity(-500, 700)).toBe(0);
    expect(glideStartVelocity(50_000, 700)).toBeCloseTo((2 * 700) / (GLIDE_MS / 1000));
    expect(glideStartVelocity(-50_000, -700)).toBeCloseTo((-2 * 700) / (GLIDE_MS / 1000));
    expect(glideStartVelocity(300, 0)).toBe(0);
  });

  test("lands exactly at rest, without overshooting, however fast the scroll was", () => {
    for (const speed of [0, 150, 1200, 50_000]) {
      const { path, frames } = glide(96, speed);
      expect(path.position(GLIDE_MS)).toBeCloseTo(PAGE);
      expect(path.velocity(GLIDE_MS)).toBeCloseTo(0);
      expect(Math.max(...frames.map(frame => frame.position))).toBeLessThanOrEqual(PAGE + 1e-6);
    }
  });

  test("picks up the scroll's speed without a jolt", () => {
    const { path } = glide(96, 1200);
    expect(path.velocity(0)).toBeCloseTo(1200);
  });

  test("speed changes smoothly frame to frame, for slow and fast scrolls alike", () => {
    for (const speed of [0, 150, 1200, 50_000]) {
      const velocities = glide(96, speed).frames.map(frame => frame.velocity);
      const peak = Math.max(...velocities);
      const steps = velocities.slice(1).map((velocity, i) => Math.abs(velocity - velocities[i]!));
      expect(Math.max(...steps)).toBeLessThan(peak * 0.15);
    }
  });

  test("from rest, a glide eases in rather than lurching", () => {
    const [first, second] = glide(0, 0).frames;
    expect(first!.velocity).toBe(0);
    expect(second!.velocity).toBeLessThan(PAGE * 0.15);
  });

  test("slow and fast scrolls share a pace: the fastest glide is under twice the slowest", () => {
    const peak = (speed: number) => Math.max(...glide(96, speed).frames.map(frame => frame.velocity));
    expect(peak(50_000) / peak(150)).toBeLessThan(2);
  });
});
