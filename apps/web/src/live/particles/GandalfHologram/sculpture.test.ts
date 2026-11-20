import { expect, test } from "bun:test";
import { buildSculpture } from "./sculpture";

test("builds a finite point cloud within its rendering budget", () => {
  const { points, surface, indices } = buildSculpture();
  expect(surface.length / 3).toBeLessThan(65536);
  expect(indices.every(index => index < surface.length / 3)).toBe(true);
  expect(points.length % 7).toBe(0);
  expect(points.length / 7).toBeGreaterThan(8000);
  expect(points.length / 7).toBeLessThan(24_000);
  expect(points.every(Number.isFinite)).toBe(true);

  const outline = { left: 0, right: 0, top: 0, bottom: 0, near: 0, far: 0 };
  for (let index = 0; index < points.length; index += 7) {
    outline.left = Math.min(outline.left, points[index]!);
    outline.right = Math.max(outline.right, points[index]!);
    outline.top = Math.max(outline.top, points[index + 1]!);
    outline.bottom = Math.min(outline.bottom, points[index + 1]!);
    outline.near = Math.max(outline.near, points[index + 2]!);
    outline.far = Math.min(outline.far, points[index + 2]!);
  }
  expect(outline.left).toBeLessThan(-1.3);
  expect(outline.right).toBeGreaterThan(1.4);
  expect(outline.top).toBeGreaterThan(0.7);
  expect(outline.top).toBeLessThan(1);
  expect(outline.bottom).toBeLessThan(-0.5);
  expect(outline.bottom).toBeGreaterThan(-0.8);
  expect(outline.near).toBeGreaterThan(0.8);
  expect(outline.far).toBeLessThan(-0.8);
});

test("the underside has an open brim and a hollow crown that reaches toward the tip", () => {
  const { surface, indices } = buildSculpture();

  function firstSurfaceAbove(x: number, z: number) {
    let height = Infinity;
    for (let triangle = 0; triangle < indices.length; triangle += 3) {
      const a = 3 * indices[triangle]!;
      const b = 3 * indices[triangle + 1]!;
      const c = 3 * indices[triangle + 2]!;
      const ax = surface[a]! - surface[c]!;
      const az = surface[a + 2]! - surface[c + 2]!;
      const bx = surface[b]! - surface[c]!;
      const bz = surface[b + 2]! - surface[c + 2]!;
      const dx = x - surface[c]!;
      const dz = z - surface[c + 2]!;
      const determinant = ax * bz - bx * az;
      if (Math.abs(determinant) < 1e-8) continue;
      const wa = (dx * bz - bx * dz) / determinant;
      const wb = (ax * dz - dx * az) / determinant;
      const wc = 1 - wa - wb;
      if (Math.min(wa, wb, wc) >= 0) {
        height = Math.min(height, wa * surface[a + 1]! + wb * surface[b + 1]! + wc * surface[c + 1]!);
      }
    }
    return height;
  }

  expect(firstSurfaceAbove(1.25, -0.06)).toBeLessThan(-0.25);
  const center = firstSurfaceAbove(0, -0.06);
  const towardTip = firstSurfaceAbove(-0.25, -0.20);
  expect(center).toBeGreaterThan(0.4);
  expect(towardTip - center).toBeGreaterThan(0.08);
  expect(towardTip).toBeLessThan(0.83);
});
