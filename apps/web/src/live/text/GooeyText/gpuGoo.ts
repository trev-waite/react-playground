import { effect, frame, sampler, target, type Gpu, type Surface } from "vgpu";
import { bilinearGaussianTaps } from "@/gpu";
import {
  BASELINE,
  BLUE,
  DROP_SIZE,
  DROP_Y,
  fontAt,
  FONT_SIZE,
  GOO_BLUR,
  GOO_CUT,
  GOO_GAIN,
  HEIGHT,
  inkColor,
  SPILL_X,
  SPILL_Y,
  type GooFrame,
  type Lines,
} from "./scene";

/** The most letters a word can have on the GPU; a longer word keeps the SVG goo. */
const MAX_LETTERS = 24;
/** Blur reads per side after pairing, which bounds the widest blur the shader runs. */
const MAX_TAPS = 16;
/** Atlas pixels per layout unit, above the goo buffer's densest. */
const ATLAS_DENSITY = 2;
const ATLAS_MAX_WIDTH = 2048;
/** Glyph overhang past its advance, so no stroke is clipped from its cell. */
const CELL_PAD = FONT_SIZE * 0.2;
/** WebKit can drop a WebGPU canvas's last frame once it stops drawing, so a frame that holds is drawn again at these delays (ms). */
const SETTLE_DELAYS = [60, 100, 140];

const SCENE_SHADER = /* wgsl */ `
struct Scene {
  origin: vec2f,
  span: vec2f,
  drop: vec4f,
  blue: vec4f,
  unit: f32,
  count: u32,
  cells: array<vec4f, ${MAX_LETTERS}>,
  atlas: array<vec4f, ${MAX_LETTERS}>,
  poses: array<vec4f, ${MAX_LETTERS}>,
  inks: array<vec4f, ${MAX_LETTERS}>,
  strands: array<vec4f, ${MAX_LETTERS}>,
}

@group(0) @binding(0) var<uniform> scene: Scene;
@group(0) @binding(1) var glyphs: texture_2d<f32>;
@group(0) @binding(2) var glyphSampler: sampler;

fn over(under: vec4f, color: vec3f, alpha: f32) -> vec4f {
  return vec4f(color * alpha, alpha) + under * (1.0 - alpha);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = scene.origin + uv * scene.span;
  var out = vec4f(0.0);
  for (var i = 0u; i < scene.count; i++) {
    let strand = scene.strands[i];
    if (strand.z <= 0.0) { continue; }
    let along = clamp(p.x, min(strand.x, strand.y), max(strand.x, strand.y));
    let off = length(vec2f(p.x - along, p.y - scene.drop.y));
    out = over(out, scene.blue.rgb, clamp((strand.z * 0.5 - off) * scene.unit + 0.5, 0.0, 1.0));
  }
  for (var i = 0u; i < scene.count; i++) {
    let pose = scene.poses[i];
    if (min(pose.z, pose.w) <= 0.0) { continue; }
    let cell = scene.cells[i];
    let t = ((p - pose.xy) / pose.zw - cell.xy) / cell.zw;
    if (any(t < vec2f(0.0)) || any(t > vec2f(1.0))) { continue; }
    let atlas = scene.atlas[i];
    let alpha = textureSampleLevel(glyphs, glyphSampler, atlas.xy + t * atlas.zw, 0.0).a;
    out = over(out, scene.inks[i].rgb, alpha);
  }
  let q = (p - scene.drop.xy) / scene.drop.zw;
  let edge = (length(q) - 1.0) * min(scene.drop.z, scene.drop.w);
  return over(out, scene.blue.rgb, clamp(0.5 - edge * scene.unit, 0.0, 1.0));
}
`;

const BLUR_SHADER = /* wgsl */ `
struct Blur {
  step: vec2f,
  count: u32,
  taps: array<vec4f, ${MAX_TAPS}>,
}

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var srcSampler: sampler;
@group(0) @binding(2) var<uniform> blur: Blur;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  var sum = textureSampleLevel(src, srcSampler, uv, 0.0) * blur.taps[0].y;
  for (var i = 1u; i < blur.count; i++) {
    let tap = blur.taps[i];
    let offset = blur.step * tap.x;
    sum += (textureSampleLevel(src, srcSampler, uv + offset, 0.0) + textureSampleLevel(src, srcSampler, uv - offset, 0.0)) * tap.y;
  }
  return sum;
}
`;

const COMPOSITE_SHADER = /* wgsl */ `
@group(0) @binding(0) var field: texture_2d<f32>;
@group(0) @binding(1) var fieldSampler: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let goo = textureSampleLevel(field, fieldSampler, uv, 0.0);
  if (goo.a <= 0.0) { return vec4f(0.0); }
  let alpha = clamp(${GOO_GAIN.toFixed(1)} * goo.a - ${GOO_CUT.toFixed(1)}, 0.0, 1.0);
  return vec4f(goo.rgb / goo.a * alpha, alpha);
}
`;

type Vec4 = [number, number, number, number];
/** Where a letter's glyph sits around its center in layout units, and where it is in the atlas. */
type Cell = { box: Vec4; atlas: Vec4 };

/** Draws every distinct character once, white on clear, and maps each letter to its glyph. */
function buildAtlas(lines: Lines): { canvas: HTMLCanvasElement; cells: Cell[][] } {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Gooey Text: 2D canvas unavailable for the glyph atlas");
  const rowHeight = Math.ceil(HEIGHT * ATLAS_DENSITY);
  const slots = new Map<string, { x: number; y: number; width: number }>();
  let x = 0;
  let y = 0;
  for (const letter of lines.words.flatMap(word => word.letters)) {
    if (slots.has(letter.char)) continue;
    const width = Math.ceil((letter.width + CELL_PAD * 2) * ATLAS_DENSITY);
    if (x > 0 && x + width > ATLAS_MAX_WIDTH) {
      x = 0;
      y += rowHeight + 2;
    }
    slots.set(letter.char, { x, y, width });
    x += width + 2;
  }
  canvas.width = Math.max(1, ...[...slots.values()].map(slot => slot.x + slot.width));
  canvas.height = y + rowHeight;
  context.font = fontAt(FONT_SIZE * ATLAS_DENSITY);
  context.fillStyle = "#fff";
  for (const [char, slot] of slots) context.fillText(char, slot.x + CELL_PAD * ATLAS_DENSITY, slot.y + BASELINE * ATLAS_DENSITY);

  const cells = lines.words.map(word =>
    word.letters.map(letter => {
      const slot = slots.get(letter.char)!;
      return {
        box: [-CELL_PAD - letter.width / 2, -DROP_Y, slot.width / ATLAS_DENSITY, HEIGHT] as Vec4,
        atlas: [slot.x / canvas.width, slot.y / canvas.height, slot.width / canvas.width, rowHeight / canvas.height] as Vec4,
      };
    }),
  );
  return { canvas, cells };
}

function blurTaps(sigma: number): { count: number; taps: Vec4[] } {
  const radius = Math.min((MAX_TAPS - 1) * 2, Math.max(1, Math.ceil(sigma * 3)));
  const { center, taps } = bilinearGaussianTaps(radius, sigma);
  const list: Vec4[] = [[0, center, 0, 0], ...taps.map(tap => [tap.offset, tap.weight, 0, 0] as Vec4)];
  while (list.length < MAX_TAPS) list.push([0, 0, 0, 0]);
  return { count: taps.length + 1, taps: list };
}

export type GooRenderer = { paint(state: GooFrame): void; destroy(): void };

/**
 * The goo on the GPU, matching the SVG filter, which costs WebKit about 10ms
 * a frame: the letters, strands, and drop are drawn into a half-size buffer,
 * blurred, then cut back to a hard edge at full size.
 */
export function createGooRenderer(gpu: Gpu, surface: Surface, lines: Lines): GooRenderer {
  if (lines.words.some(word => word.letters.length > MAX_LETTERS)) throw new Error("Gooey Text: word too long for the GPU goo");
  const { canvas, cells } = buildAtlas(lines);
  const glyphs = gpu.gpu.createTexture({
    label: "Gooey Text glyphs",
    size: [canvas.width, canvas.height],
    format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  gpu.gpu.queue.copyExternalImageToTexture({ source: canvas }, { texture: glyphs }, [canvas.width, canvas.height]);

  const linear = sampler(gpu, { minFilter: "linear", magFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });
  const field = target(gpu, { size: [1, 1], format: "rgba8unorm", label: "Gooey Text field" });
  const scratch = target(gpu, { size: [1, 1], format: "rgba8unorm", label: "Gooey Text blur" });
  const blue: Vec4 = [BLUE[0] / 255, BLUE[1] / 255, BLUE[2] / 255, 1];
  const origin = [-SPILL_X, -SPILL_Y];
  const span = [lines.width + SPILL_X * 2, HEIGHT + SPILL_Y * 2];
  const scene = effect(gpu, SCENE_SHADER, { label: "Gooey Text scene", set: { glyphs, glyphSampler: linear } });
  const across = effect(gpu, BLUR_SHADER, { label: "Gooey Text blur across", set: { src: field, srcSampler: linear } });
  const down = effect(gpu, BLUR_SHADER, { label: "Gooey Text blur down", set: { src: scratch, srcSampler: linear } });
  const composite = effect(gpu, COMPOSITE_SHADER, { label: "Gooey Text goo", set: { field, fieldSampler: linear } });
  let fieldSize: [number, number] = [0, 0];

  function fit(width: number, height: number) {
    const next: [number, number] = [Math.max(1, Math.ceil(width / 2)), Math.max(1, Math.ceil(height / 2))];
    if (next[0] === fieldSize[0] && next[1] === fieldSize[1]) return;
    fieldSize = next;
    field.resize(next);
    scratch.resize(next);
    const unit = next[0] / span[0]!;
    const { count, taps } = blurTaps(GOO_BLUR * unit);
    across.set({ blur: { step: [1 / next[0], 0], count, taps } });
    down.set({ blur: { step: [0, 1 / next[1]], count, taps } });
  }

  const padded = (list: Vec4[]) => [...list, ...Array.from({ length: MAX_LETTERS - list.length }, (): Vec4 => [0, 0, 0, 0])];

  function render(state: GooFrame) {
    frame(gpu, f => {
      fit(surface.size[0], surface.size[1]);
      const word = cells[state.word] ?? [];
      scene.set({
        scene: {
          origin,
          span,
          drop: [state.drop.x, DROP_Y, DROP_SIZE * state.drop.sx, DROP_SIZE * state.drop.sy],
          blue,
          unit: fieldSize[0] / span[0]!,
          count: Math.min(word.length, state.letters.length),
          cells: padded(word.map(cell => cell.box)),
          atlas: padded(word.map(cell => cell.atlas)),
          poses: padded(state.letters.map(letter => [letter.x, letter.y, letter.sx, letter.sy])),
          inks: padded(state.letters.map(letter => [...inkColor(letter.ink).map(channel => channel / 255), 1] as Vec4)),
          strands: padded(state.letters.map(letter => [letter.strand.from, letter.strand.to, letter.strand.width, 0])),
        },
      });
      f.pass(field, scene);
      f.pass(scratch, across);
      f.pass(field, down);
      f.pass(surface, composite);
    });
  }

  let settling: number[] = [];
  const stopSettling = () => settling.forEach(timer => window.clearTimeout(timer));

  return {
    paint(state) {
      render(state);
      stopSettling();
      settling = SETTLE_DELAYS.map(delay => window.setTimeout(() => render(state), delay));
    },
    destroy() {
      stopSettling();
      glyphs.destroy();
    },
  };
}
