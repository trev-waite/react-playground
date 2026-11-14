import { EXTENT, HEIGHTMAP_SCALE, HORIZON, LAYERS, levelOf, LIFT, nearness } from "./terraces";

/**
 * The relief drawn once on the CPU, for browsers without WebGPU: the same
 * terrain, terraces, walls, shadows, and rims as `relief.ts`, held still as
 * it is under reduced motion. Each function mirrors its shader namesake.
 */

function pcg(v: number): number {
  const state = (Math.imul(v, 747796405) + 2891336453) >>> 0;
  const word = Math.imul(((state >>> ((state >>> 28) + 4)) ^ state) >>> 0, 277803737) >>> 0;
  return ((word >>> 22) ^ word) >>> 0;
}

function hash21(x: number, y: number): number {
  const cx = Math.floor(x) >>> 0;
  const cy = Math.floor(y) >>> 0;
  return pcg((cx + pcg(cy)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number): number {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  const lx = x - cx;
  const ly = y - cy;
  const fx = lx * lx * (3 - 2 * lx);
  const fy = ly * ly * (3 - 2 * ly);
  const top = hash21(cx, cy) + (hash21(cx + 1, cy) - hash21(cx, cy)) * fx;
  const bottom = hash21(cx, cy + 1) + (hash21(cx + 1, cy + 1) - hash21(cx, cy + 1)) * fx;
  return top + (bottom - top) * fy;
}

function fbm(x: number, y: number): number {
  let total = 0;
  let amplitude = 0.5;
  for (let i = 0; i < 3; i++) {
    total += valueNoise(x, y) * amplitude;
    x = x * 2.03 + 17.1;
    y = y * 2.03 + 9.7;
    amplitude *= 0.5;
  }
  return total;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function terrain(u: number, v: number, aspect: number): number {
  const depth = (1 + HORIZON) / (v + HORIZON);
  const h = fbm((u - 0.5) * aspect * depth * 1.35 + 3.1, -depth * 1.1 * 1.35 + 7.4);
  return smoothstep(0.18, 0.82, h);
}

/** Height and its gradient (per stage uv) on a grid at `HEIGHTMAP_SCALE`, running `EXTENT` stages down. */
function heightMap(width: number, height: number) {
  const columns = Math.max(2, Math.round(width * HEIGHTMAP_SCALE));
  const rows = Math.max(2, Math.round(height * HEIGHTMAP_SCALE * EXTENT));
  const aspect = width / Math.max(height, 1);
  const ex = 3 / width;
  const ey = 3 / height;
  const data = new Float32Array(columns * rows * 3);
  for (let row = 0; row < rows; row++) {
    const v = ((row + 0.5) / rows) * EXTENT;
    for (let column = 0; column < columns; column++) {
      const u = (column + 0.5) / columns;
      const h = terrain(u, v, aspect);
      const at = (row * columns + column) * 3;
      data[at] = h;
      data[at + 1] = (terrain(u + ex, v, aspect) - h) / ex;
      data[at + 2] = (terrain(u, v + ey, aspect) - h) / ey;
    }
  }
  return { columns, rows, data };
}

type Map = ReturnType<typeof heightMap>;

/** A bilinear tap of the height map at stage uv, clamped at its edges, into `out` as [height, du, dv]. */
function sample(map: Map, u: number, v: number, out: Float32Array) {
  const x = Math.min(map.columns - 1, Math.max(0, u * map.columns - 0.5));
  const y = Math.min(map.rows - 1, Math.max(0, (v / EXTENT) * map.rows - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(map.columns - 1, x0 + 1);
  const y1 = Math.min(map.rows - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  for (let channel = 0; channel < 3; channel++) {
    const a = map.data[(y0 * map.columns + x0) * 3 + channel]!;
    const b = map.data[(y0 * map.columns + x1) * 3 + channel]!;
    const c = map.data[(y1 * map.columns + x0) * 3 + channel]!;
    const d = map.data[(y1 * map.columns + x1) * 3 + channel]!;
    out[channel] = (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  }
}

const INK = [0.11, 0.14, 0.19];
const ACCENT = [0.14, 0.28, 0.85];
const FLOOR = [0.955, 0.958, 0.962];
const MIST = [0.965, 0.967, 0.97];

/** RGBA pixels of the still relief at `width` × `height`. */
export function drawStill(width: number, height: number): Uint8ClampedArray<ArrayBuffer> {
  const map = heightMap(width, height);
  const pixels = new Uint8ClampedArray(width * height * 4);
  const samples = Array.from({ length: LAYERS }, () => new Float32Array(3));
  const caster = new Float32Array(3);
  const color = [0, 0, 0];

  const rimDistance = (tap: Float32Array, level: number) =>
    (tap[0]! - level) / Math.max(Math.hypot(tap[1]! / width, tap[2]! / height), 1e-5);

  for (let py = 0; py < height; py++) {
    const v = (py + 0.5) / height;
    const lift = LIFT * nearness(v);
    for (let px = 0; px < width; px++) {
      const u = (px + 0.5) / width;
      for (let k = 0; k < LAYERS; k++) sample(map, u, v + lift * k, samples[k]!);
      color[0] = color[1] = color[2] = 0;
      let remaining = 1;

      for (let k = LAYERS - 1; k >= 0; k--) {
        const rim = rimDistance(samples[k]!, levelOf(k));
        const faceCover = Math.min(1, Math.max(0, rim + 0.5));
        if (faceCover > 0) {
          const t = (k + 1) / LAYERS;
          let shade = 1;
          if (k + 1 < LAYERS) {
            sample(map, u - 0.006, v + lift * (k + 1) - 0.009, caster);
            shade = 1 - 0.07 * smoothstep(levelOf(k + 1) - 0.05, levelOf(k + 1) + 0.03, caster[0]!);
          }
          const index = k % 3 === 2;
          const line = (1 - smoothstep(0.35, 1.35, rim)) * (index ? 0.55 : 0.42);
          const lineColor = index ? ACCENT : INK;
          for (let channel = 0; channel < 3; channel++) {
            const face = (MIST[channel]! + (1 - MIST[channel]!) * t) * shade;
            color[channel]! += remaining * faceCover * (face + (lineColor[channel]! - face) * line);
          }
          remaining *= 1 - faceCover;
        }
        if (k > 0 && remaining > 0) {
          const wallCover = Math.min(1, Math.max(0, rimDistance(samples[k - 1]!, levelOf(k)) + 0.5));
          const t = k / LAYERS;
          const wall = [0.84 + (0.76 - 0.84) * t, 0.85 + (0.785 - 0.85) * t, 0.875 + (0.83 - 0.875) * t];
          for (let channel = 0; channel < 3; channel++) color[channel]! += remaining * wallCover * wall[channel]!;
          remaining *= 1 - wallCover;
        }
        if (remaining < 0.002) break;
      }

      const fog = 0.55 + 0.45 * smoothstep(0, 0.55, v);
      const at = (py * width + px) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const lit = color[channel]! + remaining * FLOOR[channel]!;
        pixels[at + channel] = (MIST[channel]! + (lit - MIST[channel]!) * fog) * 255;
      }
      pixels[at + 3] = 255;
    }
  }
  return pixels;
}
