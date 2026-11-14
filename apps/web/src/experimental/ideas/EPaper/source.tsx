import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

const SLIDERS = {"ghosting":0,"refreshSpeed":79,"flashEvery":3};

const PANEL_WIDTH = 144;
const PANEL_HEIGHT = 192;
/** Each panel pixel covers this many CSS pixels, so the dither pattern is easy to see. */
const CELL = 2;
const ART_HEIGHT = 76;
const MARGIN = 10;
const AUTO_TURN_MS = 4200;

const BEZEL = "#17181b";
const PAPER = [228, 226, 216] as const;
const INK = [36, 37, 41] as const;

const PAGES = [
  { title: ["Ink that", "stays put."], body: ["Black and white pigment", "holds its place with", "no power at all."] },
  { title: ["Only black", "or white."], body: ["Every grey you see here", "is a pattern of dots."] },
  { title: ["Old pages", "linger."], body: ["A quick page turn leaves", "a faint ghost behind."] },
  { title: ["A flash", "clears it."], body: ["Every few turns the panel", "blinks to wipe the ghosts."] },
];

/**
 * Bill Atkinson's dither from the first Macintosh: each pixel snaps to black
 * or white and hands three quarters of its error to six neighbors. `levels`
 * are darkness from 0 to 1; the result holds 1 for black.
 */
export function atkinson(levels: Float32Array, width: number, height: number): Uint8Array {
  const work = Float32Array.from(levels);
  const bits = new Uint8Array(levels.length);
  const spread = (x: number, y: number, error: number) => {
    if (x >= 0 && x < width && y < height) work[y * width + x]! += error;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const on = work[i]! >= 0.5 ? 1 : 0;
      bits[i] = on;
      const error = (work[i]! - on) / 8;
      spread(x + 1, y, error);
      spread(x + 2, y, error);
      spread(x - 1, y + 1, error);
      spread(x, y + 1, error);
      spread(x + 1, y + 1, error);
      spread(x, y + 2, error);
    }
  }
  return bits;
}

/**
 * Where each pixel's pigment comes to rest after a quick refresh: at its new
 * target, less the share of the old page that the short waveform leaves behind.
 */
export function partialRefresh(from: Float32Array, target: Uint8Array, ghosting: number): Float32Array {
  return from.map((old, i) => target[i]! * (1 - ghosting) + old * ghosting);
}

/**
 * Pigment partway through a refresh. A quick one drives straight to the goal;
 * a full one swings every pixel to black, then white, then the goal, which is
 * what clears the ghosts.
 */
export function refreshLevel(kind: "partial" | "full", from: number, goal: number, progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  if (kind === "partial") return from + (goal - from) * t;
  if (t < 1 / 3) return from + (1 - from) * t * 3;
  if (t < 2 / 3) return 1 - (t - 1 / 3) * 3;
  return goal * (t - 2 / 3) * 3;
}

function scratch(): CanvasRenderingContext2D | null {
  const canvas = document.createElement("canvas");
  canvas.width = PANEL_WIDTH;
  canvas.height = PANEL_HEIGHT;
  return canvas.getContext("2d", { willReadFrequently: true });
}

/** One page as the panel's driver sees it: dithered artwork above thresholded type. */
function rasterizePage(index: number): Uint8Array {
  const page = PAGES[index]!;
  const art = scratch();
  const type = scratch();
  if (!art || !type) return new Uint8Array(PANEL_WIDTH * PANEL_HEIGHT);

  art.fillStyle = "#fff";
  art.fillRect(0, 0, PANEL_WIDTH, PANEL_HEIGHT);
  const sky = art.createLinearGradient(0, 0, 0, ART_HEIGHT);
  sky.addColorStop(0, "#5e5e5e");
  sky.addColorStop(1, "#f4f4f4");
  art.fillStyle = sky;
  art.fillRect(0, 0, PANEL_WIDTH, ART_HEIGHT);
  const angle = (index / PAGES.length) * Math.PI * 2 - 2.2;
  const centerX = 36 + index * 24;
  const centerY = 38;
  const radius = 22;
  art.fillStyle = "#7a7a7a";
  art.beginPath();
  art.ellipse(centerX, centerY + radius + 5, radius * 0.9, 4, 0, 0, Math.PI * 2);
  art.fill();
  const ball = art.createRadialGradient(
    centerX + Math.cos(angle) * radius * 0.45,
    centerY + Math.sin(angle) * radius * 0.45,
    1,
    centerX,
    centerY,
    radius,
  );
  ball.addColorStop(0, "#ffffff");
  ball.addColorStop(1, "#1a1a1a");
  art.fillStyle = ball;
  art.beginPath();
  art.arc(centerX, centerY, radius, 0, Math.PI * 2);
  art.fill();

  type.fillStyle = "#000";
  type.textBaseline = "alphabetic";
  type.font = '600 21px "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
  page.title.forEach((line, row) => type.fillText(line, MARGIN, ART_HEIGHT + 30 + row * 23));
  type.font = "600 10px system-ui, -apple-system, 'Segoe UI', sans-serif";
  page.body.forEach((line, row) => type.fillText(line, MARGIN, ART_HEIGHT + 73 + row * 12, PANEL_WIDTH - MARGIN * 2));
  PAGES.forEach((_, dot) => {
    const x = MARGIN + dot * 8;
    if (dot === index) type.fillRect(x, PANEL_HEIGHT - 11, 5, 5);
    else type.fillRect(x + 1, PANEL_HEIGHT - 10, 3, 3);
  });

  const tones = art.getImageData(0, 0, PANEL_WIDTH, PANEL_HEIGHT).data;
  const levels = new Float32Array(PANEL_WIDTH * PANEL_HEIGHT);
  for (let i = 0; i < levels.length; i++) levels[i] = 1 - tones[i * 4]! / 255;
  const bits = atkinson(levels, PANEL_WIDTH, PANEL_HEIGHT);
  const letters = type.getImageData(0, 0, PANEL_WIDTH, PANEL_HEIGHT).data;
  for (let i = 0; i < bits.length; i++) if (letters[i * 4 + 3]! > 110) bits[i] = 1;
  return bits;
}

type Settings = { sliders: Record<string, number>; progress: number };

/** A running panel: `sync` after its settings change, `turn` for the next page. It draws nothing between refreshes. */
type Panel = { sync: () => void; turn: () => void; stop: () => void };

function startPanel(canvas: HTMLCanvasElement, settings: RefObject<Settings>): Panel {
  const context = canvas.getContext("2d");
  if (!context) return { sync() {}, turn() {}, stop() {} };
  const ctx = context;
  const size = PANEL_WIDTH * PANEL_HEIGHT;
  const image = ctx.createImageData(PANEL_WIDTH, PANEL_HEIGHT);
  const pages = PAGES.map((_, index) => rasterizePage(index));
  const cleared = new Uint8Array(size);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let pigment: Float32Array = new Float32Array(size);
  let from = pigment;
  let goal = pigment;
  let kind: "partial" | "full" = "partial";
  let startedAt = 0;
  let duration = 0;
  let pageIndex = 0;
  let quickTurns = 0;
  let on = false;
  let visible = true;
  let frame = 0;
  let timer = 0;

  const slider = (name: keyof typeof SLIDERS) => settings.current.sliders[name] ?? SLIDERS[name];

  function paint() {
    const data = image.data;
    for (let i = 0; i < size; i++) {
      const level = pigment[i]!;
      data[i * 4] = PAPER[0] + (INK[0] - PAPER[0]) * level;
      data[i * 4 + 1] = PAPER[1] + (INK[1] - PAPER[1]) * level;
      data[i * 4 + 2] = PAPER[2] + (INK[2] - PAPER[2]) * level;
      data[i * 4 + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
  }

  function tick(now: number) {
    frame = 0;
    const progress = duration > 0 ? (now - startedAt) / duration : 1;
    if (progress >= 1) {
      pigment = goal;
      paint();
      return;
    }
    pigment = from.map((level, i) => refreshLevel(kind, level, goal[i]!, progress));
    paint();
    if (visible) frame = requestAnimationFrame(tick);
  }

  function refresh(target: Uint8Array, full: boolean) {
    const quick = 520 - (slider("refreshSpeed") / 100) * 400;
    from = pigment;
    kind = full ? "full" : "partial";
    goal = full ? Float32Array.from(target) : partialRefresh(from, target, (slider("ghosting") / 100) * 0.3);
    duration = reducedMotion.matches ? 0 : full ? quick * 2.6 : quick;
    startedAt = performance.now();
    if (reducedMotion.matches) goal = Float32Array.from(target);
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(tick);
  }

  function schedule() {
    window.clearTimeout(timer);
    if (on && visible && !reducedMotion.matches) timer = window.setTimeout(turn, AUTO_TURN_MS);
  }

  function turn() {
    if (!on) return;
    pageIndex = (pageIndex + 1) % pages.length;
    quickTurns += 1;
    const full = quickTurns >= Math.max(1, Math.round(slider("flashEvery")));
    if (full) quickTurns = 0;
    refresh(pages[pageIndex]!, full);
    schedule();
  }

  function sync() {
    const next = settings.current.progress >= 0.5;
    if (next === on) return;
    on = next;
    quickTurns = 0;
    refresh(on ? pages[pageIndex]! : cleared, true);
    schedule();
  }

  const intersectionObserver = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
    if (visible && !frame) frame = requestAnimationFrame(tick);
    schedule();
  });
  intersectionObserver.observe(canvas);
  reducedMotion.addEventListener("change", schedule);

  on = settings.current.progress >= 0.5;
  if (on) pigment = from = goal = Float32Array.from(pages[0]!);
  paint();
  schedule();

  return {
    sync,
    turn,
    stop() {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      intersectionObserver.disconnect();
      reducedMotion.removeEventListener("change", schedule);
    },
  };
}

export function Example({
  sliders = SLIDERS,
  progress = 1,
}: { sliders?: Record<string, number>; progress?: number } = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settings = useRef({ sliders, progress });
  const panel = useRef<Panel | null>(null);
  useLayoutEffect(() => {
    settings.current = { sliders, progress };
    panel.current?.sync();
  }, [sliders, progress]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const started = startPanel(canvas, settings);
    panel.current = started;
    return () => {
      panel.current = null;
      started.stop();
    };
  }, []);

  return (
    <button
      type="button"
      aria-label="E-paper display. Turn the page"
      onClick={() => panel.current?.turn()}
      style={{
        display: "block",
        margin: 0,
        padding: 12,
        border: 0,
        borderRadius: 20,
        background: BEZEL,
        cursor: "pointer",
        touchAction: "manipulation",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <canvas
        ref={canvasRef}
        width={PANEL_WIDTH}
        height={PANEL_HEIGHT}
        aria-hidden="true"
        style={{
          display: "block",
          width: PANEL_WIDTH * CELL,
          height: PANEL_HEIGHT * CELL,
          borderRadius: 4,
          imageRendering: "pixelated",
        }}
      />
    </button>
  );
}
