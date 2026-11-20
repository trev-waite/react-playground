import { useEffect, useRef, type CSSProperties, type RefObject } from "react";
import { effect, sampler, type Frame } from "vgpu";
import { createBlurChain, createTextMask, maskFits, pausableLoop, useGpu, viewportMaskSize, WGSL_HASH, WGSL_NOISE, type GpuSession } from "@/gpu";
import { Stage } from "@/live/shared/Stage/Stage";
import stageStyles from "@/live/shared/Stage/Stage.module.css";
import { DISPLAY_FONT, isDarkTone } from "@/live/shared/Stage/tone";
import { createLamp, type Lamp } from "./lamp";
import styles from "./RakingLight.module.css";

const WORD = "Quiet";
/** Quiet time after the last canvas resize before the word is pressed again at the new size. */
const RESIZE_SETTLE_MS = 120;

const SHADER = WGSL_HASH + WGSL_NOISE + /* wgsl */ `
struct Params {
  resolution: vec2f,
  lamp: vec2f,
  presence: f32,
  dark: f32,
}

@group(0) @binding(0) var mask: texture_2d<f32>;
@group(0) @binding(1) var near: texture_2d<f32>;
@group(0) @binding(2) var mid: texture_2d<f32>;
@group(0) @binding(3) var far: texture_2d<f32>;
@group(0) @binding(4) var maskSampler: sampler;
@group(0) @binding(5) var<uniform> params: Params;

const LAMP_HEIGHT = 0.16;
const WARM = vec3f(1.0, 0.72, 0.29);

fn tap(tex: texture_2d<f32>, uv: vec2f) -> f32 {
  return textureSampleLevel(tex, maskSampler, clamp(uv, vec2f(0.0), vec2f(1.0)), 0.0).r;
}

// The press: a crisp floor with soft shoulders, so its walls catch a low light.
fn depth(uv: vec2f) -> f32 {
  return 0.5 * tap(near, uv) + 0.35 * tap(mid, uv) + 0.15 * tap(far, uv);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let resolution = max(params.resolution, vec2f(1.0));
  // Distances are in units of the stage's shorter side, so the pool keeps its size on a tall phone stage.
  let unit = resolution / min(resolution.x, resolution.y);
  let pixel = 1.0 / resolution;
  let presence = params.presence;

  let paperUv = uv * unit;
  let fiber = fbm(paperUv * vec2f(260.0, 90.0)) - 0.5;
  let grain = valueNoise(paperUv * 900.0) - 0.5;

  let e = pixel * 1.5;
  let dx = depth(uv + vec2f(e.x, 0.0)) - depth(uv - vec2f(e.x, 0.0));
  let dy = depth(uv + vec2f(0.0, e.y)) - depth(uv - vec2f(0.0, e.y));
  let relief = 9.0;
  let normal = normalize(vec3f(dx * relief + fiber * 0.06, dy * relief + grain * 0.03, 1.0));

  let core = tap(mask, uv);
  let surface = vec3f(paperUv, -depth(uv) * 0.02);
  let lamp = vec3f(params.lamp * unit, LAMP_HEIGHT);
  let toLamp = lamp - surface;
  let span = length(toLamp);
  let toward = toLamp / span;
  // Falls to nothing well before the stage's edge, so the light never meets the card's border.
  let falloff = exp(-span * span * 6.0);
  let edge = smoothstep(0.0, 0.08, min(min(uv.x, 1.0 - uv.x) * unit.x, min(uv.y, 1.0 - uv.y) * unit.y));

  // A wall between the floor and the lamp shades the floor behind it.
  let reach = normalize(toLamp.xy + vec2f(1e-4, 0.0)) * 0.016;
  let wall = tap(near, uv + reach / unit);
  let shadow = saturate((core - wall) * 1.6) * smoothstep(0.0, 0.6, 1.0 - toward.z);

  let lit = dot(normal, toward);
  let facing = lit - toward.z;
  var color: vec3f;
  if (params.dark > 0.5) {
    let paper = vec3f(0.93, 0.91, 0.87) * (1.0 + fiber * 0.05);
    color = paper * WARM * max(lit, 0.0) * falloff * edge * 1.9 * (1.0 - shadow * 0.85) * presence;
  } else {
    let pool = falloff * edge * presence;
    let shade = 1.0 + facing * pool * 1.8 - shadow * pool * 0.6 + fiber * pool * 0.05 - core * 0.025;
    color = vec3f(shade) * mix(vec3f(1.0), vec3f(1.0, 0.94, 0.84), pool * 0.7);
  }
  return vec4f(clamp(color, vec3f(0.0), vec3f(1.0)), 1.0);
}
`;

function textFont(size: number) {
  return `400 ${size}px ${DISPLAY_FONT}`;
}

function startPress({ gpu, surface, canvas }: GpuSession, lamp: Lamp, stage: HTMLElement) {
  const mask = createTextMask(gpu, { text: WORD, font: textFont, label: "Raking Light word", softness: 0.0016, scale: { height: 0.62, width: 0.34 }, fitWidth: 0.78 });
  const shoulders = createBlurChain(gpu, { levels: 3, radius: 3, format: "r8unorm", label: "Raking Light shoulders" });
  const linear = sampler(gpu, { minFilter: "linear", magFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });
  const press = effect(gpu, SHADER, {
    label: "Raking Light",
    set: {
      mask: mask.texture,
      near: shoulders.levels[0],
      mid: shoulders.levels[1],
      far: shoulders.levels[2],
      maskSampler: linear,
      params: { resolution: [1, 1], lamp: [0.5, 0.5], presence: 0, dark: 0 },
    },
  });
  const unsubscribeError = gpu.onError(error => console.error("Raking Light could not draw", error));

  let pending: { aspect: number; dpr: number; width: number; height: number } | null = null;
  let resizedAt = 0;
  let pressed = false;
  const unsubscribeResize = surface.onResize(({ width, height, dpr }) => {
    pending = { aspect: Math.max(1, width) / Math.max(1, height), dpr, width, height };
    resizedAt = performance.now();
  });

  const flush = (frame: Frame) => {
    if (!pending) return;
    if (pressed && performance.now() - resizedAt < RESIZE_SETTLE_MS) return;
    const { aspect, dpr, width, height } = pending;
    pending = null;
    press.set({ params: { resolution: [width, height], dark: isDarkTone(stage) ? 1 : 0 } });
    const size = viewportMaskSize(aspect, [window.innerWidth, window.innerHeight], dpr);
    if (pressed && maskFits(mask.size, size)) return;
    pressed = true;
    const texture = mask.update(size[0], size[1]);
    shoulders.resize(size);
    shoulders.render(frame, texture);
    press.set({ mask: texture });
  };

  const loop = pausableLoop(gpu, canvas, frame => {
    flush(frame);
    const { place, presence } = lamp.sample(performance.now());
    press.set({ params: { lamp: [place.x, place.y], presence } });
    frame.pass(surface, press);
  });

  return () => {
    loop.stop();
    unsubscribeResize();
    unsubscribeError();
    shoulders.destroy();
    mask.destroy();
  };
}

/** Without WebGPU, the same lamp moves a pool of light and the word's shadows in CSS. */
function runFallbackLamp(stage: HTMLElement, lamp: Lamp): () => void {
  let frame = 0;
  let visible = true;
  const draw = (now: number) => {
    frame = 0;
    const { place, presence } = lamp.sample(now);
    stage.style.setProperty("--lamp-x", `${(place.x * 100).toFixed(2)}%`);
    stage.style.setProperty("--lamp-y", `${(place.y * 100).toFixed(2)}%`);
    stage.style.setProperty("--shadow-x", `${((0.5 - place.x) * 6).toFixed(2)}px`);
    stage.style.setProperty("--shadow-y", `${((0.5 - place.y) * 6).toFixed(2)}px`);
    stage.style.setProperty("--presence", presence.toFixed(3));
    if (visible) frame = requestAnimationFrame(draw);
  };
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
    if (visible && !frame) frame = requestAnimationFrame(draw);
  });
  observer.observe(stage);
  frame = requestAnimationFrame(draw);
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
  };
}

function useFallbackLamp(stageRef: RefObject<HTMLDivElement | null>, lampRef: RefObject<Lamp | null>, active: boolean) {
  useEffect(() => {
    const stage = stageRef.current;
    const lamp = lampRef.current;
    if (!stage || !lamp || !active) return;
    return runFallbackLamp(stage, lamp);
  }, [stageRef, lampRef, active]);
}

export function RakingLight() {
  const holderRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lampRef = useRef<Lamp | null>(null);

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;
    const lamp = createLamp(holder);
    lampRef.current = lamp;
    if (holder.closest("[data-open]")) lamp.open();
    return () => {
      lamp.stop();
      lampRef.current = null;
    };
  }, []);

  const { status } = useGpu(canvasRef, {
    label: "Raking Light",
    start: session => {
      const lamp = lampRef.current;
      const holder = holderRef.current;
      if (!lamp || !holder) return;
      return startPress(session, lamp, holder);
    },
  });
  useFallbackLamp(holderRef, lampRef, status !== "running");

  return (
    <Stage className={styles.stage} role="img" label={`The word “${WORD}” pressed into paper, lit by a lamp that follows the pointer`} onOpen={() => lampRef.current?.open()}>
      <div ref={holderRef} className={styles.holder} data-gpu={status === "running" || undefined} style={{ "--presence": 0 } as CSSProperties}>
        <div className={styles.fallback} aria-hidden="true">
          <span className={styles.pool} />
          <span className={`${stageStyles.display} ${styles.word}`}>{WORD}</span>
        </div>
        <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
      </div>
    </Stage>
  );
}
