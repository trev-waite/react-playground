import { effect, sampler, target, type Effect, type Frame, type Gpu, type Target } from "vgpu";
import { bilinearGaussianTaps } from "./gaussian";

export type BlurChainOptions = {
  /** Number of half-resolution levels. Level 0 is 1/2 size, level 1 is 1/4, ... Defaults to 3. */
  levels?: number;
  /** Gaussian radius in source texels per pass. Defaults to 4 (5 bilinear reads). */
  radius?: number;
  /** Defaults to `rgba8unorm`. Use `r8unorm` for single-channel masks. */
  format?: GPUTextureFormat;
  label?: string;
};

export type BlurChain = {
  /** Progressively wider blurs of the source. Bind a level directly: `effect.set({ glow: chain.levels[1] })`. */
  readonly levels: readonly Target[];
  /** Full-resolution source size. Levels resize to halves of it. */
  resize(size: readonly [number, number]): void;
  /** Encodes every level into `frame`. Run this once per source change, not per frame. */
  render(frame: Frame, source: GPUTexture | Target): void;
  destroy(): void;
};

function blurShader(radius: number) {
  const { center, taps } = bilinearGaussianTaps(radius);
  const tapLines = taps
    .map(
      tap =>
        `  sum += (textureSampleLevel(src, srcSampler, uv + step * ${tap.offset.toFixed(6)}, 0.0)` +
        ` + textureSampleLevel(src, srcSampler, uv - step * ${tap.offset.toFixed(6)}, 0.0)) * ${tap.weight.toFixed(6)};`,
    )
    .join("\n");
  return /* wgsl */ `
struct BlurParams {
  step: vec2f,
}

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var srcSampler: sampler;
@group(0) @binding(2) var<uniform> params: BlurParams;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let step = params.step;
  var sum = textureSampleLevel(src, srcSampler, uv, 0.0) * ${center.toFixed(6)};
${tapLines}
  return sum;
}
`;
}

function halve(size: readonly [number, number], times: number): [number, number] {
  const divisor = 2 ** times;
  return [Math.max(1, Math.ceil(size[0] / divisor)), Math.max(1, Math.ceil(size[1] / divisor))];
}

function destroyTarget(candidate: Target) {
  if ("destroy" in candidate && typeof candidate.destroy === "function") candidate.destroy();
}

/**
 * Separable gaussian pyramid: each level blurs the previous one horizontally into a scratch target
 * while halving, then vertically into the level. Sampling a level with one bilinear tap replaces a
 * wide multi-tap blur in the main pass. Sizes start at 1x1 until `resize` runs.
 */
export function createBlurChain(gpu: Gpu, options: BlurChainOptions = {}): BlurChain {
  const levelCount = options.levels ?? 3;
  const format = options.format ?? "rgba8unorm";
  const label = options.label ?? "Blur chain";
  const shader = blurShader(options.radius ?? 4);
  const linear = sampler(gpu, {
    minFilter: "linear",
    magFilter: "linear",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
  });

  const levels: Target[] = [];
  const scratch: Target[] = [];
  const horizontal: Effect[] = [];
  const vertical: Effect[] = [];

  for (let i = 0; i < levelCount; i++) {
    const level = target(gpu, { size: [1, 1], format, label: `${label} level ${i}` });
    const temp = target(gpu, { size: [1, 1], format, label: `${label} scratch ${i}` });
    levels.push(level);
    scratch.push(temp);
    horizontal.push(
      effect(gpu, shader, {
        label: `${label} horizontal ${i}`,
        set: { srcSampler: linear, params: { step: [0, 0] }, ...(i > 0 ? { src: levels[i - 1] } : {}) },
      }),
    );
    vertical.push(
      effect(gpu, shader, {
        label: `${label} vertical ${i}`,
        set: { src: temp, srcSampler: linear, params: { step: [0, 0] } },
      }),
    );
  }

  return {
    levels,
    resize(size) {
      let sourceSize: [number, number] = [Math.max(1, size[0]), Math.max(1, size[1])];
      for (let i = 0; i < levelCount; i++) {
        const levelSize = halve(size, i + 1);
        scratch[i]?.resize(levelSize);
        levels[i]?.resize(levelSize);
        horizontal[i]?.set({ params: { step: [1 / sourceSize[0], 0] } });
        vertical[i]?.set({ params: { step: [0, 1 / levelSize[1]] } });
        sourceSize = levelSize;
      }
    },
    render(frame, source) {
      horizontal[0]?.set({ src: source });
      for (let i = 0; i < levelCount; i++) {
        const temp = scratch[i];
        const level = levels[i];
        const blurH = horizontal[i];
        const blurV = vertical[i];
        if (!temp || !level || !blurH || !blurV) continue;
        frame.pass(temp, blurH);
        frame.pass(level, blurV);
      }
    },
    destroy() {
      scratch.forEach(destroyTarget);
      levels.forEach(destroyTarget);
    },
  };
}
