import { WGSL_HASH, WGSL_NOISE } from "@/gpu";
import { BASE_LEVEL, EXTENT, HORIZON, LAYERS, LEVEL_STEP, LIFT } from "./terraces";

const PARAMS = /* wgsl */ `
struct Params {
  resolution: vec2f,
  pointer: vec2f,
  time: f32,
  pointerStrength: f32,
}
@group(0) @binding(0) var<uniform> params: Params;
`;

/** Height and its gradient (per stage uv) at every heightmap texel. */
export const HEIGHT_SHADER =
  WGSL_HASH +
  WGSL_NOISE +
  PARAMS +
  /* wgsl */ `
fn terrain(uv: vec2f) -> f32 {
  let aspect = params.resolution.x / max(params.resolution.y, 1.0);
  let depth = ${1 + HORIZON} / (uv.y + ${HORIZON});
  let ground = vec2f((uv.x - 0.5) * aspect * depth, -depth * 1.1);
  let drift = vec2f(params.time * 0.018, params.time * -0.011);
  var h = fbm(ground * 1.35 + drift + vec2f(3.1, 7.4));
  h = smoothstep(0.18, 0.82, h);
  let d = (uv - params.pointer) * vec2f(aspect, 1.0);
  h += 0.2 * params.pointerStrength * exp(-dot(d, d) / 0.03);
  return h;
}

@fragment fn fs_main(@location(0) mapUv: vec2f) -> @location(0) vec4f {
  let uv = vec2f(mapUv.x, mapUv.y * ${EXTENT});
  let e = 1.0 / max(params.resolution, vec2f(1.0));
  let h = terrain(uv);
  let hx = terrain(uv + vec2f(e.x * 3.0, 0.0));
  let hy = terrain(uv + vec2f(0.0, e.y * 3.0));
  return vec4f(h, (hx - h) / (e.x * 3.0), (hy - h) / (e.y * 3.0), 1.0);
}
`;

/**
 * Stacks the terraces back to front. A pixel shows the highest terrace whose
 * footprint, lifted by its height, covers it; failing that, the wall under a
 * terrace's edge; failing that, a lower terrace. The terrace above casts a
 * soft shadow down and to the right, and each rim gets a hairline.
 */
export const RELIEF_SHADER =
  PARAMS.replace("@binding(0)", "@binding(2)") +
  /* wgsl */ `
@group(0) @binding(0) var heightMap: texture_2d<f32>;
@group(0) @binding(1) var heightSampler: sampler;

const LAYERS = ${LAYERS};

fn level(layer: i32) -> f32 {
  return ${BASE_LEVEL} + f32(layer) * ${LEVEL_STEP};
}

fn lift(layer: i32, uv: vec2f) -> vec2f {
  return vec2f(0.0, ${LIFT} * f32(layer) * (uv.y + ${HORIZON}) / ${1 + HORIZON});
}

fn heightAt(uv: vec2f) -> vec3f {
  return textureSampleLevel(heightMap, heightSampler, vec2f(uv.x, uv.y / ${EXTENT}), 0.0).xyz;
}

/** Distance in pixels from a sample to its terrace's rim, from the stored gradient. */
fn rimDistance(sample: vec3f, terraceLevel: f32) -> f32 {
  let slope = length(sample.yz / params.resolution);
  return (sample.x - terraceLevel) / max(slope, 1e-5);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  var samples: array<vec3f, LAYERS>;
  for (var k = 0; k < LAYERS; k++) {
    samples[k] = heightAt(uv + lift(k, uv));
  }

  let ink = vec3f(0.11, 0.14, 0.19);
  let accent = vec3f(0.14, 0.28, 0.85);
  let floor = vec3f(0.955, 0.958, 0.962);
  var color = vec3f(0.0);
  var remaining = 1.0;

  // Front to back: each terrace face, then the wall under its edge, covers what is left by its
  // coverage of this pixel, so every boundary is antialiased over about one pixel.
  for (var k = LAYERS - 1; k >= 0; k--) {
    let rim = rimDistance(samples[k], level(k));
    let faceCover = clamp(rim + 0.5, 0.0, 1.0);
    if (faceCover > 0.0) {
      let t = f32(k + 1) / f32(LAYERS);
      var face = mix(vec3f(0.965, 0.967, 0.97), vec3f(1.0, 1.0, 1.0), t);
      if (k + 1 < LAYERS) {
        let caster = heightAt(uv + lift(k + 1, uv) + vec2f(-0.006, -0.009)).x;
        face *= 1.0 - 0.07 * smoothstep(level(k + 1) - 0.05, level(k + 1) + 0.03, caster);
      }
      let isIndex = (k % 3) == 2;
      let line = 1.0 - smoothstep(0.35, 1.35, rim);
      face = mix(face, select(ink, accent, isIndex), line * select(0.42, 0.55, isIndex));
      color += remaining * faceCover * face;
      remaining *= 1.0 - faceCover;
    }
    if (k > 0 && remaining > 0.0) {
      let wallCover = clamp(rimDistance(samples[k - 1], level(k)) + 0.5, 0.0, 1.0);
      let t = f32(k) / f32(LAYERS);
      color += remaining * wallCover * mix(vec3f(0.84, 0.85, 0.875), vec3f(0.76, 0.785, 0.83), t);
      remaining *= 1.0 - wallCover;
    }
    if (remaining < 0.002) {
      break;
    }
  }
  color += remaining * floor;

  let fog = smoothstep(0.0, 0.55, uv.y);
  color = mix(vec3f(0.965, 0.967, 0.97), color, 0.55 + 0.45 * fog);
  return vec4f(color, 1.0);
}
`;
