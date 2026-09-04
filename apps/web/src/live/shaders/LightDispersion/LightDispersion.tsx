import { useRef } from "react";
import { clock, effect, sampler, type Frame } from "vgpu";
import {
  createBlurChain,
  createTextMask,
  pausableLoop,
  useGpu,
  WGSL_HASH,
  WGSL_NOISE,
  WGSL_SPECTRUM,
  WGSL_TONEMAP,
} from "@/gpu";

const SLIDERS = {"slider1":80,"slider2":68,"slider3":35};
const TEXT = "Hello There";
const FONT_FAMILY = 'system-ui, "SF Pro Display", "Segoe UI", Arial, Helvetica, sans-serif';

function textFont(size: number) {
  return `800 ${size}px ${FONT_FAMILY}`;
}

function sliderUnit(sliders: Record<string, number>, key: keyof typeof SLIDERS) {
  return (sliders[key] ?? SLIDERS[key]) / 100;
}

const LIGHT_DISPERSION_SHADER = WGSL_HASH + WGSL_NOISE + WGSL_SPECTRUM + WGSL_TONEMAP + /* wgsl */ `
struct Params {
  resolution: vec2f,
  pointer: vec2f,
  velocity: vec2f,
  time: f32,
  dispersion: f32,
  bloom: f32,
  motion: f32,
  presence: f32,
  pointerStrength: f32,
  heat: f32,
}

@group(0) @binding(0) var textMask: texture_2d<f32>;
@group(0) @binding(1) var glowNear: texture_2d<f32>;
@group(0) @binding(2) var glowMid: texture_2d<f32>;
@group(0) @binding(3) var glowFar: texture_2d<f32>;
@group(0) @binding(4) var maskSampler: sampler;
@group(0) @binding(5) var<uniform> params: Params;

const SPECTRAL_TAPS = 7;
const LIGHT_GAIN = 2.8;

fn sampleMask(tex: texture_2d<f32>, uv: vec2f) -> f32 {
  let inside = select(0.0, 1.0, all(uv >= vec2f(0.0)) && all(uv <= vec2f(1.0)));
  return textureSampleLevel(tex, maskSampler, clamp(uv, vec2f(0.0), vec2f(1.0)), 0.0).r * inside;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let resolution = max(params.resolution, vec2f(1.0));
  let pixel = 1.0 / resolution;
  let aspect = resolution.x / resolution.y;
  let reveal = saturate(params.presence);
  let motion = params.motion;
  // Converging reveal: light starts wide and soft, then settles into the slider values.
  let dispersion = mix(params.dispersion * 3.0 + 0.6, params.dispersion, reveal);
  let bloom = mix(min(params.bloom * 2.5 + 0.5, 1.6), params.bloom, reveal);

  let fromPointer = (uv - params.pointer) * vec2f(aspect, 1.0);
  let radius = length(fromPointer);
  let local = exp(-radius * radius * 22.0) * params.pointerStrength;

  // Heat plume: hottest at the pointer, rising and widening above it (top-origin UV, up is -y).
  let rise = max(-fromPointer.y, 0.0);
  let sink = max(fromPointer.y, 0.0);
  let plumeWidth = 0.05 + rise * 0.5;
  let plume = exp(-(fromPointer.x * fromPointer.x) / (plumeWidth * plumeWidth))
    * exp(-rise * 3.4)
    * exp(-sink * sink * 120.0)
    * params.heat;

  let flowUv = vec2f(uv.x * aspect, uv.y);
  let q = flowUv * 13.0 + vec2f(params.time * 0.35, params.time * 1.7);
  let turbulence = vec2f(ridged(q), ridged(q + vec2f(31.7, 11.3))) - vec2f(0.5);
  // Heat keeps a floor so the pointer still shimmers when the Motion slider is low.
  let heatMotion = 0.35 + motion;
  let shimmer = turbulence * plume * heatMotion * 0.03;
  let mirage = vec2f(0.0, -plume * heatMotion * 0.014 * (0.4 + 0.6 * valueNoise(q * 0.5)));

  let driftNoise = vec2f(
    valueNoise(flowUv * 5.0 + vec2f(params.time * 0.21, 0.0)),
    valueNoise(flowUv * 5.0 + vec2f(7.3, params.time * -0.17))
  ) - vec2f(0.5);
  let drift = driftNoise * pixel * 2.2 * motion;

  // Horizontal jitter that varies along y kinks the vertical strokes.
  let jitterPx = resolution.y * 0.004 * (0.5 + motion) * (1.0 + plume * 4.0);
  let jitter = vec2f((valueNoise(vec2f(uv.y * 42.0, params.time * 1.5)) - 0.5) * jitterPx * pixel.x, 0.0);

  let sampleUv = uv + drift + jitter + shimmer + mirage;

  // Spectral split along a mostly horizontal axis that tilts toward the pointer nearby.
  let splitPx = resolution.y * (0.008 + dispersion * 0.03) * (1.0 + local * 1.5 + plume * 1.2);
  let toPointer = normalize(fromPointer + vec2f(1e-4, 0.0));
  let axisDir = normalize(mix(vec2f(1.0, 0.16), toPointer, local * 0.65));
  let axis = axisDir * splitPx * pixel;

  var tinted = vec3f(0.0);
  var weight = vec3f(0.0);
  for (var i = 0; i < SPECTRAL_TAPS; i++) {
    let t = f32(i) / f32(SPECTRAL_TAPS - 1);
    let tint = spectrum(t);
    tinted += tint * sampleMask(textMask, sampleUv + axis * (t - 0.5) * 2.0);
    weight += tint;
  }
  let body = tinted / max(weight, vec3f(1e-3));
  let core = sampleMask(textMask, sampleUv);

  let near = sampleMask(glowNear, sampleUv);
  let mid = sampleMask(glowMid, sampleUv);
  let far = sampleMask(glowFar, sampleUv);
  let haloRaw = near * (0.25 + bloom * 0.35) + mid * bloom * 0.6 + far * bloom * 0.75;
  let halo = max(haloRaw - core * 0.95, 0.0);

  // Spectral taps share the energy of one white edge; lift the pixels outside the core so each
  // band reads at full brightness while the interior stays exactly white.
  let fringeBoost = (1.0 - core) * 1.8;
  var light = body * (LIGHT_GAIN + fringeBoost);
  light += vec3f(0.72, 0.82, 1.0) * halo * 0.9;
  let warmth = plume * (0.3 + length(turbulence) * 0.8) * (mid + far * 0.6);
  light += vec3f(1.0, 0.55, 0.22) * warmth * 1.6;
  light *= reveal;

  var color = min(tonemapSoft(light) * tonemapNorm(LIGHT_GAIN), vec3f(1.0));
  let alpha = max(color.r, max(color.g, color.b));

  let grainTime = floor(params.time * 24.0);
  let grainSeed = floor(uv * resolution) + vec2f(grainTime * 13.0, grainTime * 7.0);
  let grain = (hash21(grainSeed) - 0.5) * 0.05 * saturate(halo * 2.0 + core * 0.15);
  color = clamp(color + vec3f(grain) * alpha, vec3f(0.0), vec3f(alpha));
  return vec4f(color, alpha);
}
`;

type Point = { x: number; y: number };

export function LightDispersion({
  sliders = SLIDERS,
  progress = 1,
}: { sliders?: Record<string, number>; progress?: number } = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settingsRef = useRef({ sliders, progress });
  settingsRef.current = { sliders, progress };

  const { status } = useGpu(canvasRef, {
    label: "Light dispersion",
    start: ({ gpu, surface: canvasSurface, canvas }) => {
      // Keep the mask crisp so each spectral tap reads as its own band instead of blending to pastel.
      const textMask = createTextMask(gpu, {
        text: TEXT,
        font: textFont,
        label: "Hello There mask",
        softness: 0.0012,
        // Plaque is already tight to the type; fill it instead of the old 30%-of-stage default.
        scale: { height: 0.78, width: 0.52 },
        fitWidth: 0.9,
      });
      const glow = createBlurChain(gpu, { levels: 3, format: "r8unorm", label: "Hello There glow" });
      const maskSampler = sampler(gpu, {
        minFilter: "linear",
        magFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      const pointerTarget: Point = { x: 0.5, y: 0.5 };
      const pointerCurrent: Point = { x: 0.5, y: 0.5 };
      const pointerVelocity: Point = { x: 0, y: 0 };
      let lastPointer: Point = { ...pointerTarget };
      let lastPointerTime = performance.now();
      let activePointerId: number | null = null;
      let pointerLive = false;
      let pointerStrength = 0;
      let heat = 0;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
      const time = clock(gpu);
      const unsubscribeError = gpu.onError(error => {
        console.error("Unable to run the light dispersion shader", error);
      });

      const dispersionEffect = effect(gpu, LIGHT_DISPERSION_SHADER, {
        label: "Refracted text",
        set: {
          textMask: textMask.texture,
          glowNear: glow.levels[0],
          glowMid: glow.levels[1],
          glowFar: glow.levels[2],
          maskSampler,
          params: {
            resolution: [1, 1],
            pointer: [0.5, 0.5],
            velocity: [0, 0],
            time: 0,
            dispersion: sliderUnit(SLIDERS, "slider1"),
            bloom: sliderUnit(SLIDERS, "slider2"),
            motion: sliderUnit(SLIDERS, "slider3"),
            presence: 1,
            pointerStrength: 0,
            heat: 0,
          },
        },
      });

      // Resizes are coalesced and flushed at the top of the next frame: rasterising the mask and
      // re-blurring every resize event is wasteful, and frame() cannot run inside onResize.
      let pendingSize: [number, number] | null =
        canvasSurface.size[0] > 1 && canvasSurface.size[1] > 1
          ? [canvasSurface.size[0], canvasSurface.size[1]]
          : null;
      const unsubscribeResize = canvasSurface.onResize(({ width, height }) => {
        pendingSize = [Math.max(1, width), Math.max(1, height)];
      });
      const flushResize = (frame: Frame) => {
        if (!pendingSize) return;
        const [width, height] = pendingSize;
        pendingSize = null;
        const mask = textMask.update(width, height);
        glow.resize([width, height]);
        glow.render(frame, mask);
        dispersionEffect.set({ textMask: mask, params: { resolution: [width, height] } });
      };

      const updatePointer = (event: PointerEvent) => {
        if (event.pointerType === "touch" && activePointerId !== event.pointerId) return;
        const bounds = canvas.getBoundingClientRect();
        const next = {
          x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / Math.max(bounds.width, 1))),
          y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / Math.max(bounds.height, 1))),
        };
        const now = performance.now();
        const deltaSeconds = Math.max((now - lastPointerTime) / 1000, 1 / 120);
        pointerVelocity.x = Math.max(-2.5, Math.min(2.5, (next.x - lastPointer.x) / deltaSeconds));
        pointerVelocity.y = Math.max(-2.5, Math.min(2.5, (next.y - lastPointer.y) / deltaSeconds));
        pointerTarget.x = next.x;
        pointerTarget.y = next.y;
        lastPointer = next;
        lastPointerTime = now;
        pointerLive = true;
      };

      const onPointerDown = (event: PointerEvent) => {
        if (activePointerId !== null) return;
        activePointerId = event.pointerId;
        canvas.setPointerCapture(event.pointerId);
        updatePointer(event);
      };
      const onPointerMove = (event: PointerEvent) => updatePointer(event);
      const onPointerEnd = (event: PointerEvent) => {
        if (activePointerId !== event.pointerId) return;
        activePointerId = null;
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        if (event.pointerType !== "mouse") pointerLive = false;
      };
      const onPointerLeave = (event: PointerEvent) => {
        if (event.pointerType !== "mouse") return;
        pointerLive = false;
      };

      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", onPointerEnd);
      canvas.addEventListener("pointercancel", onPointerEnd);
      canvas.addEventListener("pointerleave", onPointerLeave);

      const loop = pausableLoop(gpu, canvas, frame => {
        flushResize(frame);

        const deltaSeconds = Math.min(time.deltaTime, 0.05);
        const still = reducedMotion.matches;
        const follow = still ? 1 : 1 - Math.exp(-deltaSeconds * 8);
        pointerCurrent.x += (pointerTarget.x - pointerCurrent.x) * follow;
        pointerCurrent.y += (pointerTarget.y - pointerCurrent.y) * follow;
        pointerVelocity.x *= Math.exp(-deltaSeconds * 5);
        pointerVelocity.y *= Math.exp(-deltaSeconds * 5);
        const strengthTarget = pointerLive && !still ? 1 : 0;
        pointerStrength += (strengthTarget - pointerStrength) * (1 - Math.exp(-deltaSeconds * 7));
        // Heat builds with pointer speed and lingers a moment after the pointer stops.
        const speed = Math.hypot(pointerVelocity.x, pointerVelocity.y);
        const heatTarget = pointerLive && !still ? Math.min(1, 0.45 + speed * 0.5) : 0;
        const heatRate = heatTarget > heat ? 6 : 2.5;
        heat += (heatTarget - heat) * (1 - Math.exp(-deltaSeconds * heatRate));

        const currentSliders = settingsRef.current.sliders;
        const reveal = Math.min(1, Math.max(0, settingsRef.current.progress));
        dispersionEffect.set({
          params: {
            pointer: [pointerCurrent.x, pointerCurrent.y],
            velocity: [pointerVelocity.x, pointerVelocity.y],
            time: still ? 0 : time.time,
            dispersion: sliderUnit(currentSliders, "slider1"),
            bloom: sliderUnit(currentSliders, "slider2"),
            motion: still ? 0 : sliderUnit(currentSliders, "slider3"),
            presence: reveal,
            pointerStrength,
            heat: pointerStrength * heat,
          },
        });
        frame.pass(canvasSurface, dispersionEffect);
      });

      return () => {
        loop.stop();
        unsubscribeResize();
        unsubscribeError();
        canvas.removeEventListener("pointerdown", onPointerDown);
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("pointerup", onPointerEnd);
        canvas.removeEventListener("pointercancel", onPointerEnd);
        canvas.removeEventListener("pointerleave", onPointerLeave);
        glow.destroy();
        textMask.destroy();
      };
    },
  });

  return (
    <div
      style={{
        display: "grid",
        placeItems: "center",
        width: "100%",
        height: "100%",
        containerType: "size",
      }}
    >
      <div
        style={{
          position: "relative",
          display: "grid",
          placeItems: "center",
          padding: "1.15rem 1.85rem 1.05rem",
          borderRadius: "1rem",
          overflow: "hidden",
          background: "#000",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            color: "#f4f4f5",
            fontFamily: FONT_FAMILY,
            fontSize: "min(30cqh, 16.1cqw)",
            fontWeight: 800,
            lineHeight: 0.95,
            whiteSpace: "nowrap",
            opacity: status === "running" ? 0 : 1,
            transition: "opacity 250ms ease",
          }}
        >
          {TEXT}
        </span>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Hello There in refracted light"
          style={{
            position: "absolute",
            inset: 0,
            display: "block",
            width: "100%",
            height: "100%",
            touchAction: "none",
          }}
        />
      </div>
    </div>
  );
}
