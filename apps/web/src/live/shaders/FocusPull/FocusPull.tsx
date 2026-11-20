import { useEffect, useRef, type RefObject } from "react";
import { effect, sampler } from "vgpu";
import { createBlurChain, pausableLoop, useGpu, type GpuSession } from "@/gpu";
import { MOTION, play, prefersReducedMotion } from "@/live/shared/Stage/choreography";
import { Stage } from "@/live/shared/Stage/Stage";
import stageStyles from "@/live/shared/Stage/Stage.module.css";
import { followPointer, watchTone, type PointerPlace } from "@/live/shared/Stage/tone";
import { blurLevel, CAMERA, fitPage, idleFocus, MAX_BLUR_LEVEL, pageRowAt, ROWS_PER_LEVEL, type Page } from "./focus";
import { POEM, rasterPoem } from "./poem";
import styles from "./FocusPull.module.css";

/** Pixel width the poem is drawn at for the GPU; its blur levels halve from there. */
const RASTER_WIDTH = 1400;
/** How quickly focus racks to the line under the hand, per second. */
const RACK_RATE = 5;
/** The page comes into focus over a little longer than a word takes to rise. */
const FOCUS_IN_MS = MOTION.enterMs * 1.8;

const SHADER = /* wgsl */ `
struct Params {
  resolution: vec2f,
  page: vec2f,
  lens: vec2f,
  tilt: f32,
  focus: f32,
  presence: f32,
  dark: f32,
  accent: f32,
  depth: f32,
}

@group(0) @binding(0) var sharp: texture_2d<f32>;
@group(0) @binding(1) var soft: texture_2d<f32>;
@group(0) @binding(2) var softer: texture_2d<f32>;
@group(0) @binding(3) var softest: texture_2d<f32>;
@group(0) @binding(4) var pageSampler: sampler;
@group(0) @binding(5) var<uniform> params: Params;

const TAN = ${CAMERA.tan};
const DISTANCE = ${CAMERA.distance};
const MAX_LEVEL = ${MAX_BLUR_LEVEL}.0;
const ROWS_PER_LEVEL = ${ROWS_PER_LEVEL};

fn ink(tex: texture_2d<f32>, uv: vec2f) -> f32 {
  return textureSampleLevel(tex, pageSampler, uv, 0.0).r;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let resolution = max(params.resolution, vec2f(1.0));
  let aspect = resolution.x / resolution.y;
  let screen = (vec2f(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0) - vec2f(0.0, params.lens.y)) / params.lens.x;
  let upward = vec3f(0.0, cos(params.tilt), sin(params.tilt));
  let normal = vec3f(0.0, -upward.z, upward.y);
  let direction = vec3f(screen.x * aspect * TAN, screen.y * TAN, 1.0);
  let t = DISTANCE * normal.z / dot(direction, normal);
  let point = direction * t;
  let along = dot(point - vec3f(0.0, 0.0, DISTANCE), upward);
  let pageUv = vec2f(point.x / params.page.x + 0.5, 0.5 - along / params.page.y);

  let paper = select(vec3f(1.0), vec3f(0.0), params.dark > 0.5);
  let inkColor = select(vec3f(0.0), vec3f(1.0), params.dark > 0.5);
  let accent = select(vec3f(0.145, 0.388, 0.922), vec3f(0.376, 0.647, 0.98), params.dark > 0.5);
  if (t <= 0.0 || any(pageUv < vec2f(0.0)) || any(pageUv > vec2f(1.0, 1.0))) {
    return vec4f(paper, 1.0);
  }

  let rows = abs(pageUv.y - params.focus) * params.depth;
  let level = min(MAX_LEVEL, max(rows / ROWS_PER_LEVEL, (1.0 - params.presence) * MAX_LEVEL));
  let a = ink(sharp, pageUv);
  let b = ink(soft, pageUv);
  let c = ink(softer, pageUv);
  let d = ink(softest, pageUv);
  var amount = mix(a, b, saturate(level));
  amount = mix(amount, c, saturate(level - 1.0));
  amount = mix(amount, d, saturate(level - 2.0));
  // Wide blurs spread the same ink thinner; a slight lift keeps far lines a soft gray rather than nothing.
  amount = saturate(amount * (1.0 + level * 0.12));
  let haze = mix(1.0, 0.5, saturate((1.0 - pageUv.y) * 0.9));
  var color = mix(paper, inkColor, amount * haze);

  let mark = step(0.035, pageUv.x) * step(pageUv.x, 0.06) * (1.0 - smoothstep(0.004, 0.009, rows));
  color = mix(color, accent, mark * params.presence * params.accent);
  return vec4f(color, 1.0);
}
`;

/** Under reduced motion nothing drifts, so the depth of field is shallower and every line stays readable. */
const REDUCED_DEPTH = 0.15;

type Rack = {
  open: () => void;
  /** The page row in focus (0 top, 1 bottom), how far the page has come into focus, and how quickly blur grows away from it. */
  sample: (now: number) => { focus: number; presence: number; depth: number };
  /** The rows of the poem's lines, so the keyboard can step between them. */
  lines: (rows: readonly number[]) => void;
  /** Tells the rack how to find the row under the hand. */
  aim: (rowAt: (place: PointerPlace) => number | null) => void;
  stop: () => void;
};

function createRack(holder: HTMLElement): Rack {
  const reduced = prefersReducedMotion();
  let rowAt: (place: PointerPlace) => number | null = () => null;
  let hand: number | null = null;
  let rows: readonly number[] = [];
  let chosen: number | null = null;
  let focus = reduced ? 0.12 : idleFocus(0);
  let openedAt: number | null = null;
  let last = 0;
  let idleSince = 0;
  const unfollow = followPointer(holder, place => {
    hand = place ? rowAt(place) : null;
  });
  const choose = (index: number) => {
    chosen = Math.min(rows.length - 1, Math.max(0, index));
    holder.setAttribute("aria-valuenow", String(chosen + 1));
    holder.setAttribute("aria-valuetext", POEM.filter(Boolean)[chosen] ?? "");
  };
  const keys: Record<string, (index: number) => number> = {
    ArrowDown: index => index + 1,
    ArrowRight: index => index + 1,
    ArrowUp: index => index - 1,
    ArrowLeft: index => index - 1,
    Home: () => 0,
    End: () => rows.length - 1,
  };
  const onKey = (event: KeyboardEvent) => {
    const step = keys[event.key];
    if (!step || rows.length === 0) return;
    event.preventDefault();
    const nearest = rows.reduce((best, row, index) => (Math.abs(row - focus) < Math.abs(rows[best]! - focus) ? index : best), 0);
    choose(step(chosen ?? nearest));
  };
  holder.addEventListener("keydown", onKey);
  return {
    open: () => {
      openedAt ??= performance.now();
      idleSince = openedAt;
    },
    sample: now => {
      const seconds = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      if (hand !== null) idleSince = now;
      if (chosen !== null) idleSince = now;
      const target = hand ?? (chosen !== null ? rows[chosen]! : reduced ? focus : idleFocus((now - idleSince) / 1000));
      focus = reduced ? target : target + (focus - target) * Math.exp(-RACK_RATE * seconds);
      const presence = openedAt === null ? 0 : reduced ? 1 : Math.min(1, (now - openedAt) / FOCUS_IN_MS) ** 0.6;
      return { focus, presence, depth: reduced ? REDUCED_DEPTH : 1 };
    },
    lines: next => {
      rows = next;
    },
    aim: next => {
      rowAt = next;
    },
    stop: () => {
      unfollow();
      holder.removeEventListener("keydown", onKey);
    },
  };
}

function startFocus({ gpu, surface, canvas }: GpuSession, rack: Rack, holder: HTMLElement) {
  const raster = document.createElement("canvas");
  const layout = rasterPoem(raster, POEM, RASTER_WIDTH);
  const texture = gpu.gpu.createTexture({
    label: "Focus Pull page",
    size: [raster.width, raster.height],
    format: "rgba8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });
  gpu.gpu.queue.copyExternalImageToTexture({ source: raster }, { texture }, { width: raster.width, height: raster.height });
  const blur = createBlurChain(gpu, { levels: 3, radius: 4, format: "r8unorm", label: "Focus Pull depth of field" });
  blur.resize([raster.width, raster.height]);
  const linear = sampler(gpu, { minFilter: "linear", magFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });
  const paint = effect(gpu, SHADER, {
    label: "Focus Pull",
    set: {
      sharp: texture,
      soft: blur.levels[0],
      softer: blur.levels[1],
      softest: blur.levels[2],
      pageSampler: linear,
      params: { resolution: [1, 1], page: [1, 1], lens: [1, 0], tilt: 0.9, focus: 0.5, presence: 0, dark: 0, accent: 1, depth: 1 },
    },
  });
  const unwatchTone = watchTone(holder, dark => paint.set({ params: { dark: dark ? 1 : 0 } }));
  const unsubscribeError = gpu.onError(error => console.error("Focus Pull could not draw", error));
  const rows = layout.rows.filter(Number.isFinite);
  rack.lines(rows);
  const lineHalf = (rows[1]! - rows[0]!) / 2;
  const content = { left: 0.03, right: 0.94, top: rows[0]! - lineHalf, bottom: rows.at(-1)! + lineHalf };
  let page: Page = fitPage(1, layout.aspect, content);
  let aspect = 1;
  const unsubscribeResize = surface.onResize(({ width, height }) => {
    aspect = Math.max(1, width) / Math.max(1, height);
    page = fitPage(aspect, layout.aspect, content);
    paint.set({ params: { resolution: [width, height], page: [page.width, page.height], lens: [page.zoom, page.shift], tilt: page.tilt } });
  });
  rack.aim(place => pageRowAt(page, aspect, place.x * 2 - 1, 1 - place.y * 2));

  let blurred = false;
  const loop = pausableLoop(gpu, canvas, frame => {
    if (!blurred) {
      blur.render(frame, texture);
      blurred = true;
    }
    const { focus, presence, depth } = rack.sample(performance.now());
    paint.set({ params: { focus, presence, depth } });
    frame.pass(surface, paint);
  });

  return () => {
    loop.stop();
    unsubscribeResize();
    unsubscribeError();
    unwatchTone();
    blur.destroy();
    texture.destroy();
  };
}

/** Without WebGPU, the poem leans back in CSS and each line takes the blur its distance from the focus calls for. */
function runFallbackRack(page: HTMLElement, rack: Rack): () => void {
  const lines = Array.from(page.querySelectorAll<HTMLElement>("[data-line]"));
  let rows: number[] = [];
  const measure = () => {
    rows = lines.map(line => (line.offsetTop + line.offsetHeight / 2) / Math.max(1, page.offsetHeight));
    rack.lines(rows);
  };
  const resize = new ResizeObserver(measure);
  resize.observe(page);
  measure();
  rack.aim(place => {
    const bounds = page.parentElement!.getBoundingClientRect();
    const y = bounds.top + place.y * bounds.height;
    let best: number | null = null;
    let gap = Infinity;
    for (const [index, line] of lines.entries()) {
      const box = line.getBoundingClientRect();
      const distance = Math.abs(box.top + box.height / 2 - y);
      if (distance < gap) {
        gap = distance;
        best = rows[index] ?? null;
      }
    }
    return best;
  });
  let frame = 0;
  let visible = true;
  const draw = (now: number) => {
    frame = 0;
    const { focus, presence, depth } = rack.sample(now);
    lines.forEach((line, index) => {
      const level = String(Math.round(blurLevel(((rows[index] ?? 0) - focus) * depth, presence) * 2));
      if (line.dataset.level !== level) line.dataset.level = level;
    });
    if (visible) frame = requestAnimationFrame(draw);
  };
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
    if (visible && !frame) frame = requestAnimationFrame(draw);
  });
  observer.observe(page);
  frame = requestAnimationFrame(draw);
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    resize.disconnect();
  };
}

function useFallbackRack(pageRef: RefObject<HTMLDivElement | null>, rackRef: RefObject<Rack | null>, active: boolean) {
  useEffect(() => {
    const page = pageRef.current;
    const rack = rackRef.current;
    if (!page || !rack || !active) return;
    return runFallbackRack(page, rack);
  }, [pageRef, rackRef, active]);
}

/** Brings the page into focus and raises its credit once the focus has landed. */
function openPage(root: HTMLElement, rack: Rack | null) {
  rack?.open();
  const credit = play(Array.from(root.querySelectorAll(`.${styles.credit}`)), "rise", { delayMs: FOCUS_IN_MS * 0.6 });
  return credit.cancel;
}

export function FocusPull() {
  const holderRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rackRef = useRef<Rack | null>(null);

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;
    const rack = createRack(holder);
    rackRef.current = rack;
    if (holder.closest("[data-open]")) rack.open();
    return () => {
      rack.stop();
      rackRef.current = null;
    };
  }, []);

  const { status } = useGpu(canvasRef, {
    label: "Focus Pull",
    start: session => {
      const rack = rackRef.current;
      const holder = holderRef.current;
      if (!rack || !holder) return;
      return startFocus(session, rack, holder);
    },
  });
  useFallbackRack(pageRef, rackRef, status !== "running");

  return (
    <Stage className={styles.stage} onOpen={root => openPage(root, rackRef.current)}>
      <div
        ref={holderRef}
        className={styles.holder}
        data-gpu={status === "running" || undefined}
        tabIndex={0}
        role="slider"
        aria-label="Line in focus"
        aria-orientation="vertical"
        aria-valuemin={1}
        aria-valuemax={POEM.filter(Boolean).length}
        aria-valuenow={1}
        aria-valuetext={POEM[0]}
      >
        <div className={styles.fallback}>
          <div ref={pageRef} className={`${stageStyles.display} ${styles.page}`} aria-hidden="true">
            {POEM.map((line, index) =>
              line ? (
                <p key={index} className={styles.line} data-line data-level="6">
                  {line}
                </p>
              ) : (
                <p key={index} className={styles.gap} />
              ),
            )}
          </div>
        </div>
        <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
      </div>
      <p className={stageStyles.srOnly}>{POEM.filter(Boolean).join(" ")}</p>
      <p className={`${stageStyles.support} ${styles.credit}`} data-reveal>
        Robert Frost, “Nothing Gold Can Stay”
      </p>
    </Stage>
  );
}
