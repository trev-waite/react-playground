// WGSL snippets ideas concatenate into their shader template. This app has no `.wgsl` loader, so
// shared functions live here as strings: `const SHADER = WGSL_HASH + WGSL_NOISE + BODY`.
// Each snippet only depends on the ones listed in its comment.

/** `pcg`, `hash21`, `hash22`: integer hashes, stable across GPUs (the `sin`-based ones band on mobile). */
export const WGSL_HASH = /* wgsl */ `
fn pcg(v: u32) -> u32 {
  let state = v * 747796405u + 2891336453u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

fn hashCell(p: vec2f) -> u32 {
  let cell = bitcast<vec2u>(vec2i(floor(p)));
  return pcg(cell.x + pcg(cell.y));
}

fn hash21(p: vec2f) -> f32 {
  return f32(hashCell(p)) * (1.0 / 4294967296.0);
}

fn hash22(p: vec2f) -> vec2f {
  let h = hashCell(p);
  return vec2f(f32(h), f32(pcg(h))) * (1.0 / 4294967296.0);
}
`;

/** Requires WGSL_HASH. `valueNoise` 0..1, `fbm` 0..1 (3 octaves), `ridged` 0..1 with sharp creases. */
export const WGSL_NOISE = /* wgsl */ `
fn valueNoise(p: vec2f) -> f32 {
  let cell = floor(p);
  let local = fract(p);
  let fade = local * local * (3.0 - 2.0 * local);
  return mix(
    mix(hash21(cell), hash21(cell + vec2f(1.0, 0.0)), fade.x),
    mix(hash21(cell + vec2f(0.0, 1.0)), hash21(cell + vec2f(1.0, 1.0)), fade.x),
    fade.y
  );
}

fn fbm(p: vec2f) -> f32 {
  var q = p;
  var amplitude = 0.5;
  var total = 0.0;
  for (var i = 0; i < 3; i++) {
    total += valueNoise(q) * amplitude;
    q = q * 2.03 + vec2f(17.1, 9.7);
    amplitude *= 0.5;
  }
  return total;
}

fn ridged(p: vec2f) -> f32 {
  let n = fbm(p) * 2.0 - 1.0;
  return 1.0 - abs(n);
}
`;

/**
 * `spectrum(t)`: visible-light colour for t in 0..1 (0 violet, 1 red). Zucconi's bump fit; sums of
 * evenly spaced taps are close to white, so divide by the accumulated weights to keep a white core.
 */
export const WGSL_SPECTRUM = /* wgsl */ `
fn spectrumBump(x: vec3f, yOffset: vec3f) -> vec3f {
  return saturate(vec3f(1.0) - x * x - yOffset);
}

fn spectrum(t: f32) -> vec3f {
  let x = saturate(t);
  let c1 = vec3f(3.54585104, 2.93225262, 2.41593945);
  let x1 = vec3f(0.69549072, 0.49228336, 0.27699880);
  let y1 = vec3f(0.02312639, 0.15225084, 0.52607955);
  let c2 = vec3f(3.90307140, 3.21182957, 3.96587128);
  let x2 = vec3f(0.11748627, 0.86755042, 0.66077860);
  let y2 = vec3f(0.84897130, 0.88445281, 0.73949448);
  return spectrumBump(c1 * (x - x1), y1) + spectrumBump(c2 * (x - x2), y2);
}
`;

/** `tonemapSoft`: HDR light to 0..1 without a hard clip. `tonemapNorm(gain)` rescales so `gain` maps to 1. */
export const WGSL_TONEMAP = /* wgsl */ `
fn tonemapSoft(light: vec3f) -> vec3f {
  return vec3f(1.0) - exp(-light);
}

fn tonemapNorm(gain: f32) -> f32 {
  return 1.0 / (1.0 - exp(-gain));
}

fn luminance(rgb: vec3f) -> f32 {
  return dot(rgb, vec3f(0.2126, 0.7152, 0.0722));
}
`;
