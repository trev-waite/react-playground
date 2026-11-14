import { describe, expect, test } from "bun:test";
import { distanceField, flowField, sampleFlow } from "./WindTunnel";

const WIDTH = 60;
const HEIGHT = 40;

/** A block in the middle of the tunnel, standing in for a letter. */
function block(): Uint8Array {
  const solid = new Uint8Array(WIDTH * HEIGHT);
  for (let y = 16; y < 24; y++) for (let x = 26; x < 34; x++) solid[y * WIDTH + x] = 1;
  return solid;
}

describe("Wind Tunnel distance field", () => {
  test("measures how far each cell is from the obstacle", () => {
    const solid = new Uint8Array(21 * 21);
    solid[10 * 21 + 10] = 1;
    const distance = distanceField(solid, 21, 21);
    expect(distance[10 * 21 + 10]).toBe(0);
    expect(distance[10 * 21 + 14]).toBeCloseTo(4);
    expect(distance[3 * 21 + 10]).toBeCloseTo(7);
    expect(distance[13 * 21 + 13]).toBeCloseTo(3 * Math.SQRT2);
  });
});

describe("Wind Tunnel flow", () => {
  test("an empty tunnel flows straight at the free-stream speed", () => {
    const flow = flowField(new Uint8Array(WIDTH * HEIGHT), WIDTH, HEIGHT, HEIGHT / 2, 6);
    expect(flow.u.every(speed => Math.abs(speed - 1) < 1e-6)).toBe(true);
    expect(flow.v.every(speed => Math.abs(speed) < 1e-6)).toBe(true);
  });

  test("the air is still inside the obstacle and undisturbed far from it", () => {
    const flow = flowField(block(), WIDTH, HEIGHT, HEIGHT / 2, 6);
    const [insideU, insideV] = sampleFlow(flow, 30, 20);
    expect(Math.hypot(insideU, insideV)).toBeLessThan(0.05);
    const [farU, farV] = sampleFlow(flow, 3, 5);
    expect(farU).toBeCloseTo(1, 3);
    expect(farV).toBeCloseTo(0, 3);
  });

  test("air squeezed past the obstacle speeds up", () => {
    const flow = flowField(block(), WIDTH, HEIGHT, HEIGHT / 2, 6);
    let fastest = 0;
    for (let y = 2; y < 16; y++) fastest = Math.max(fastest, sampleFlow(flow, 30, y)[0]);
    expect(fastest).toBeGreaterThan(1.3);
  });

  test("it parts around the obstacle: up above the centerline, down below it", () => {
    const flow = flowField(block(), WIDTH, HEIGHT, HEIGHT / 2, 6);
    expect(sampleFlow(flow, 22, 15)[1]).toBeLessThan(-0.05);
    expect(sampleFlow(flow, 22, 25)[1]).toBeGreaterThan(0.05);
  });

  test("as much air crosses every section of the tunnel, so smoke never piles up", () => {
    const flow = flowField(block(), WIDTH, HEIGHT, HEIGHT / 2, 6);
    const through = (x: number) => {
      let total = 0;
      for (let y = 1; y < HEIGHT - 1; y++) total += flow.u[y * WIDTH + x]!;
      return total;
    };
    const upstream = through(2);
    for (const x of [15, 26, 30, 33, 45, 57]) expect(through(x)).toBeCloseTo(upstream, 3);
  });

  test("sampling blends between cells and clamps outside the tunnel", () => {
    const flow = { u: Float32Array.from([0, 2, 0, 2]), v: Float32Array.from([0, 0, 4, 4]), width: 2, height: 2 };
    const [u, v] = sampleFlow(flow, 0.5, 0.25);
    expect(u).toBeCloseTo(1);
    expect(v).toBeCloseTo(1);
    expect(sampleFlow(flow, -5, -5)).toEqual([0, 0]);
  });
});
