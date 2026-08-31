import { useRef } from "react";
import { clock, effect, frameLoop, sampler } from "vgpu";
import { useGpu } from "@/gpu";

const SLIDERS = {"slider1":3,"slider2":100,"slider3":9};
const TEXT = "Hello There";
const FONT_FAMILY = 'system-ui, "SF Pro Display", "Segoe UI", Arial, Helvetica, sans-serif';

function maskUsage() {
  return GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST;
}

function textFont(size: number) {
  return `800 ${size}px ${FONT_FAMILY}`;
}

const LIGHT_DISPERSION_SHADER = /* wgsl */ `
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
}

@group(0) @binding(0) var textMask: texture_2d<f32>;
@group(0) @binding(1) var textSampler: sampler;
@group(0) @binding(2) var<uniform> params: Params;

fn maskAt(uv: vec2f) -> f32 {
  let inside = select(0.0, 1.0, all(uv >= vec2f(0.0)) && all(uv <= vec2f(1.0)));
  return textureSampleLevel(textMask, textSampler, clamp(uv, vec2f(0.0), vec2f(1.0)), 0.0).r * inside;
}

fn softMask(uv: vec2f, pixel: vec2f, radius: f32) -> f32 {
  var total = maskAt(uv) * 0.22;
  total += maskAt(uv + vec2f(1.0, 0.0) * pixel * radius) * 0.12;
  total += maskAt(uv + vec2f(-1.0, 0.0) * pixel * radius) * 0.12;
  total += maskAt(uv + vec2f(0.0, 1.0) * pixel * radius) * 0.12;
  total += maskAt(uv + vec2f(0.0, -1.0) * pixel * radius) * 0.12;
  total += maskAt(uv + vec2f(0.72, 0.72) * pixel * radius) * 0.075;
  total += maskAt(uv + vec2f(-0.72, 0.72) * pixel * radius) * 0.075;
  total += maskAt(uv + vec2f(0.72, -0.72) * pixel * radius) * 0.075;
  total += maskAt(uv + vec2f(-0.72, -0.72) * pixel * radius) * 0.075;
  return total;
}

fn hash21(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

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

fn flowField(uv: vec2f, time: f32) -> vec2f {
  var q = uv * 6.2 + vec2f(time * 0.31, time * 0.19);
  let first = vec2f(valueNoise(q), valueNoise(q + vec2f(17.2, 9.4)));
  q = q * 1.85 + (first - 0.5) * 1.35 + vec2f(time * -0.12, time * 0.27);
  let second = vec2f(valueNoise(q), valueNoise(q + vec2f(8.1, 23.7)));
  return (first - 0.5) * 1.15 + (second - 0.5) * 0.55;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let pixel = 1.0 / max(params.resolution, vec2f(1.0));
  let aspect = params.resolution.x / max(params.resolution.y, 1.0);
  let fromPointer = (uv - params.pointer) * vec2f(aspect, 1.0);
  let radius = length(fromPointer);
  let local = exp(-radius * radius * 22.0) * params.pointerStrength;
  let coreLocal = exp(-radius * radius * 48.0) * params.pointerStrength;
  let flow = flowField(uv * vec2f(aspect, 1.0), params.time);
  let swirl = vec2f(-fromPointer.y, fromPointer.x);
  let drag = params.velocity * vec2f(aspect, 1.0) * 0.045;
  let haze = flow * 0.00115 * params.motion;
  let bend = (
    flow * (0.01 + coreLocal * 0.06)
    + swirl * (0.9 * local)
    + fromPointer * (-0.055 * local)
    + drag * (0.55 * local + 1.1 * coreLocal)
  ) * params.motion;
  let warp = haze + bend;

  let split = (3.4 + params.dispersion * 7.2) * (1.0 + local * 2.1 + coreLocal * 1.4);
  let axis = vec2f(split, split * 0.16) * pixel;
  let sampleUv = uv + warp;
  let body = softMask(sampleUv, pixel, 1.15);
  let warm = softMask(sampleUv + axis, pixel, 1.7);
  let cool = softMask(sampleUv - axis, pixel, 1.7);
  let farWarm = softMask(sampleUv + axis * 1.85, pixel, 2.6);
  let farCool = softMask(sampleUv - axis * 1.85, pixel, 2.6);
  let violet = softMask(sampleUv + vec2f(axis.y, -axis.x) * 1.15, pixel, 2.1);

  let closeGlow = softMask(sampleUv, pixel, 4.2 + params.bloom * 4.8);
  let midGlow = softMask(sampleUv, pixel, 9.5 + params.bloom * 10.0);
  let farGlow = softMask(sampleUv, pixel, 18.5 + params.bloom * 20.0);

  var rgb = vec3f(0.0);
  rgb += vec3f(body) * 0.92;
  rgb += vec3f(warm, body * 0.9, cool) * (0.42 + params.dispersion * 0.28);
  rgb += vec3f(1.0, 0.38, 0.1) * farWarm * (0.22 + params.dispersion * 0.38);
  rgb += vec3f(0.12, 0.72, 1.0) * farCool * (0.2 + params.dispersion * 0.36);
  rgb += vec3f(0.62, 0.18, 0.92) * violet * (0.08 + params.dispersion * 0.12);
  rgb += vec3f(0.85, 0.9, 1.0) * max(closeGlow - body * 0.78, 0.0) * (0.28 + params.bloom * 0.5);
  rgb += vec3f(0.7, 0.8, 1.0) * max(midGlow - closeGlow * 0.55, 0.0) * params.bloom * 0.48;
  rgb += vec3f(0.5, 0.62, 0.88) * max(farGlow - midGlow * 0.6, 0.0) * params.bloom * 0.24;

  let grainSeed = floor(uv * params.resolution) + vec2f(params.time * 37.0, params.time * 19.0);
  let grain = (hash21(grainSeed) * 2.0 - 1.0) * 0.045;
  rgb = (rgb + vec3f(grain)) * params.presence;
  rgb = clamp(rgb, vec3f(0.0), vec3f(1.0));
  let alpha = max(rgb.r, max(rgb.g, rgb.b));
  return vec4f(rgb, alpha);
}
`;

type Point = { x: number; y: number };

function drawTextMask(canvas: HTMLCanvasElement, width: number, height: number) {
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return;

  context.fillStyle = "#000";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#fff";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  let fontSize = Math.min(height * 0.3, width * 0.18);
  context.font = textFont(fontSize);
  const measuredWidth = context.measureText(TEXT).width;
  fontSize *= Math.min(1, (width * 0.84) / Math.max(measuredWidth, 1));
  context.font = textFont(fontSize);
  context.filter = `blur(${Math.max(0.8, height * 0.0028)}px)`;
  context.fillText(TEXT, width * 0.5, height * 0.49);
}

function uploadMask(device: GPUDevice, source: HTMLCanvasElement): GPUTexture {
  const width = Math.max(1, source.width);
  const height = Math.max(1, source.height);
  const next = device.createTexture({
    label: "Hello There mask",
    size: [width, height],
    format: "rgba8unorm",
    usage: maskUsage(),
  });
  const context = source.getContext("2d");
  if (context) {
    const pixels = context.getImageData(0, 0, width, height);
    device.queue.writeTexture(
      { texture: next },
      pixels.data,
      { bytesPerRow: width * 4, rowsPerImage: height },
      { width, height },
    );
  }
  return next;
}

export function Example({
  sliders = SLIDERS,
  progress = 1,
}: { sliders?: Record<string, number>; progress?: number } = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settingsRef = useRef({ sliders, progress });
  settingsRef.current = { sliders, progress };

  const { status } = useGpu(canvasRef, {
    label: "Light dispersion",
    start: ({ gpu, surface: canvasSurface, canvas }) => {
      const maskCanvas = document.createElement("canvas");
      let maskTexture = gpu.gpu.createTexture({
        label: "Hello There mask",
        size: [1, 1],
        format: "rgba8unorm",
        usage: maskUsage(),
      });
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
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
      const time = clock(gpu);
      const unsubscribeError = gpu.onError(error => {
        console.error("Unable to start the light dispersion shader", error);
      });

      const dispersionEffect = effect(gpu, LIGHT_DISPERSION_SHADER, {
        label: "Refracted text",
        set: {
          textMask: maskTexture,
          textSampler: maskSampler,
          params: {
            resolution: [1, 1],
            pointer: [0.5, 0.5],
            velocity: [0, 0],
            time: 0,
            dispersion: 0.58,
            bloom: 0.62,
            motion: 0.54,
            presence: 1,
            pointerStrength: 0,
          },
        },
      });

      const unsubscribeResize = canvasSurface.onResize(({ width, height }) => {
        const nextWidth = Math.max(1, width);
        const nextHeight = Math.max(1, height);
        drawTextMask(maskCanvas, nextWidth, nextHeight);
        const nextTexture = uploadMask(gpu.gpu, maskCanvas);
        dispersionEffect.set({
          textMask: nextTexture,
          params: { resolution: [nextWidth, nextHeight] },
        });
        maskTexture.destroy();
        maskTexture = nextTexture;
      });

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

      const loop = frameLoop(gpu, frame => {
        const deltaSeconds = Math.min(time.deltaTime, 0.05);
        const follow = reducedMotion.matches ? 1 : 1 - Math.exp(-deltaSeconds * 8);
        pointerCurrent.x += (pointerTarget.x - pointerCurrent.x) * follow;
        pointerCurrent.y += (pointerTarget.y - pointerCurrent.y) * follow;
        pointerVelocity.x *= Math.exp(-deltaSeconds * 5);
        pointerVelocity.y *= Math.exp(-deltaSeconds * 5);
        const strengthTarget = pointerLive && !reducedMotion.matches ? 1 : 0;
        pointerStrength += (strengthTarget - pointerStrength) * (1 - Math.exp(-deltaSeconds * 7));

        const currentSliders = settingsRef.current.sliders;
        const reveal = Math.min(1, Math.max(0, settingsRef.current.progress));
        dispersionEffect.set({
          params: {
            pointer: [pointerCurrent.x, pointerCurrent.y],
            velocity: [pointerVelocity.x, pointerVelocity.y],
            time: reducedMotion.matches ? 0 : time.time,
            dispersion: ((currentSliders.slider1 ?? 58) / 100) * reveal,
            bloom: ((currentSliders.slider2 ?? 62) / 100) * reveal,
            motion: reducedMotion.matches ? 0 : ((currentSliders.slider3 ?? 54) / 100) * reveal,
            presence: reveal,
            pointerStrength,
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
        maskTexture.destroy();
      };
    },
  });

  return (
    <div
      style={{
        position: "relative",
        display: "grid",
        placeItems: "center",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "#000",
        containerType: "size",
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
          cursor: "crosshair",
          touchAction: "none",
        }}
      />
    </div>
  );
}
