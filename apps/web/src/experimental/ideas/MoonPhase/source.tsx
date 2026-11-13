import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

const SLIDERS = {"pixelSize":50,"earthshine":50,"stars":50};

export const SYNODIC_MONTH = 29.530588853;
/** Julian date of the new moon of 6 January 2000, 18:14 UTC. */
const NEW_MOON_EPOCH = 2451550.26;
const DAY_MS = 86_400_000;
const IDLE_FRAME_MS = 200;
const KEY_HOLD_MS = 1400;

/** Days since the last new moon, from the mean length of a lunation. Good to about half a day. */
export function moonAge(date: Date): number {
  const julian = date.getTime() / DAY_MS + 2440587.5;
  const cycles = (julian - NEW_MOON_EPOCH) / SYNODIC_MONTH;
  return (cycles - Math.floor(cycles)) * SYNODIC_MONTH;
}

/** The share of the disc that is sunlit, 0 at new moon and 1 at full. */
export function illumination(age: number): number {
  return (1 - Math.cos((age / SYNODIC_MONTH) * Math.PI * 2)) / 2;
}

export function phaseName(age: number): string {
  const turn = age / SYNODIC_MONTH;
  const near = (point: number) => Math.abs(turn - point) < 0.02;
  if (turn < 0.02 || turn > 0.98) return "New Moon";
  if (near(0.25)) return "First Quarter";
  if (near(0.5)) return "Full Moon";
  if (near(0.75)) return "Last Quarter";
  if (turn < 0.25) return "Waxing Crescent";
  if (turn < 0.5) return "Waxing Gibbous";
  if (turn < 0.75) return "Waning Gibbous";
  return "Waning Crescent";
}

/** Bayer's 8×8 ordered-dither threshold at a pixel, from 0 to 1: a brightness above it turns the pixel on. */
export function bayerThreshold(x: number, y: number): number {
  let rank = 0;
  for (let bit = 0; bit < 3; bit++) {
    rank = (rank << 2) | ((((x ^ y) >> bit) & 1) << 1) | ((y >> bit) & 1);
  }
  return (rank + 0.5) / 64;
}

function hash3(x: number, y: number, z: number): number {
  const t = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453123;
  return t - Math.floor(t);
}

function valueNoise(x: number, y: number, z: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const fz = smooth(z - iz);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const corner = (dx: number, dy: number, dz: number) => hash3(ix + dx, iy + dy, iz + dz);
  return lerp(
    lerp(lerp(corner(0, 0, 0), corner(1, 0, 0), fx), lerp(corner(0, 1, 0), corner(1, 1, 0), fx), fy),
    lerp(lerp(corner(0, 0, 1), corner(1, 0, 1), fx), lerp(corner(0, 1, 1), corner(1, 1, 1), fx), fy),
    fz,
  );
}

const smoothstep = (low: number, high: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
};

/** Craters as points on the near side: direction, angular radius, and how bright their rays are. */
const CRATERS = [
  { x: -0.12, y: -0.7, radius: 0.07, rays: 1 },
  { x: -0.36, y: 0.16, radius: 0.06, rays: 0.5 },
  { x: -0.62, y: 0.4, radius: 0.045, rays: 0.3 },
  { x: 0.3, y: -0.38, radius: 0.05, rays: 0 },
  { x: 0.52, y: 0.5, radius: 0.04, rays: 0 },
  { x: 0.08, y: 0.62, radius: 0.05, rays: 0 },
  { x: 0.62, y: -0.12, radius: 0.035, rays: 0 },
].map(crater => ({ ...crater, z: Math.sqrt(1 - crater.x * crater.x - crater.y * crater.y) }));

/** How much light the surface returns at a point on the sphere: dark seas, bright highlands, craters, and rays. */
function albedo(x: number, y: number, z: number): number {
  const seas = valueNoise(x * 2.3 + 4.1, y * 2.3 + 1.7, z * 2.3) * 0.65 + valueNoise(x * 5.1, y * 5.1 + 9.2, z * 5.1) * 0.35;
  let value = 0.94 - 0.5 * smoothstep(0.46, 0.6, seas);
  for (const crater of CRATERS) {
    const distance = Math.acos(Math.min(1, x * crater.x + y * crater.y + z * crater.z));
    if (distance < crater.radius) value = distance > crater.radius * 0.7 ? 1 : value * 0.82;
    if (crater.rays > 0) {
      const angle = Math.atan2(y - crater.y, x - crater.x);
      const spokes = Math.max(0, Math.sin(angle * 7 + Math.sin(angle * 3) * 1.4)) ** 5;
      value += crater.rays * 0.3 * spokes * Math.exp(-distance * 2.6);
    }
  }
  return Math.min(1, value);
}

type Settings = { sliders: Record<string, number>; progress: number };
type Elements = { root: HTMLElement; canvas: HTMLCanvasElement; name: HTMLElement; detail: HTMLElement };

/**
 * Draws tonight's moon as one-bit pixels. The sphere's normals and surface are
 * worked out once per size; each repaint only relights them from the sun's
 * side for the day shown and thresholds the result through the Bayer matrix.
 * Dragging scrubs through the month and letting go eases back to tonight.
 */
function startMoon({ root, canvas, name, detail }: Elements, settings: RefObject<Settings>): () => void {
  const context = canvas.getContext("2d");
  if (!context) return () => {};
  const ctx = context;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short" });
  let image = ctx.createImageData(1, 1);
  let columns = 1;
  let rows = 1;
  let cell = 1;
  let radius = 1;
  let centerX = 0;
  let centerY = 0;
  let normals = new Float32Array(0);
  let surface = new Float32Array(0);
  let stars: { x: number; y: number; period: number; phase: number }[] = [];
  let layoutKey = "";
  let paintedKey = "";
  let scrub = 0;
  let drag: { pointerId: number; startX: number; startScrub: number } | null = null;
  let holdUntil = 0;
  let visible = true;
  let frame = 0;
  let timer = 0;
  let lastTime = performance.now();

  const slider = (key: keyof typeof SLIDERS) => (settings.current.sliders[key] ?? SLIDERS[key]) / 100;

  function layout() {
    const width = root.clientWidth;
    const height = root.clientHeight;
    const key = [width, height, slider("pixelSize"), slider("stars")].join("|");
    if (key === layoutKey || width < 2 || height < 2) return;
    layoutKey = key;
    const diameter = Math.min(width * 0.62, height * 0.56);
    cell = Math.max(1, Math.round(diameter / (150 - slider("pixelSize") * 100)));
    columns = Math.ceil(width / cell);
    rows = Math.ceil(height / cell);
    radius = Math.max(4, Math.floor(diameter / cell / 2));
    centerX = Math.floor(columns / 2);
    centerY = Math.floor((height * 0.42) / cell);
    canvas.width = columns;
    canvas.height = rows;
    canvas.style.width = `${columns * cell}px`;
    canvas.style.height = `${rows * cell}px`;
    root.style.setProperty("--moon-label-top", `${(centerY + radius) * cell + 20}px`);
    image = ctx.createImageData(columns, rows);

    const span = radius * 2 + 1;
    normals = new Float32Array(span * span * 3);
    surface = new Float32Array(span * span).fill(-1);
    for (let j = 0; j < span; j++) {
      for (let i = 0; i < span; i++) {
        const x = (i - radius) / radius;
        const y = (radius - j) / radius;
        const rim = x * x + y * y;
        if (rim > 1) continue;
        const z = Math.sqrt(1 - rim);
        const at = j * span + i;
        normals.set([x, y, z], at * 3);
        surface[at] = albedo(x, y, z);
      }
    }

    const count = Math.round(columns * rows * (0.0006 + slider("stars") * 0.0034));
    const clear = (radius + 3) ** 2;
    stars = [];
    for (let index = 0; index < count; index++) {
      const x = Math.floor(hash3(index, 1, 7) * columns);
      const y = Math.floor(hash3(index, 2, 7) * rows);
      if ((x - centerX) ** 2 + (y - centerY) ** 2 < clear) continue;
      if (Math.abs(x - centerX) < 150 / cell && y > centerY && y < centerY + radius + 72 / cell) continue;
      stars.push({ x, y, period: 1800 + hash3(index, 3, 7) * 5200, phase: hash3(index, 4, 7) });
    }
  }

  function paint(age: number, time: number) {
    const data = image.data;
    data.fill(0);
    const light = (x: number, y: number) => {
      const at = (y * columns + x) * 4;
      data[at] = data[at + 1] = data[at + 2] = data[at + 3] = 255;
    };
    for (const star of stars) {
      if ((time / star.period + star.phase) % 1 > 0.14) light(star.x, star.y);
    }
    const turn = (age / SYNODIC_MONTH) * Math.PI * 2;
    const sunX = Math.sin(turn);
    const sunZ = -Math.cos(turn);
    const earthshine = slider("earthshine") * 0.09 * (1 - illumination(age));
    const span = radius * 2 + 1;
    for (let j = 0; j < span; j++) {
      const y = centerY - radius + j;
      if (y < 0 || y >= rows) continue;
      for (let i = 0; i < span; i++) {
        const at = j * span + i;
        const reflect = surface[at]!;
        const x = centerX - radius + i;
        if (reflect < 0 || x < 0 || x >= columns) continue;
        const facing = Math.max(0, normals[at * 3]! * sunX + normals[at * 3 + 2]! * sunZ);
        const brightness = reflect * (facing ** 0.55 * 0.96 + earthshine);
        if (brightness > bayerThreshold(x, y)) light(x, y);
      }
    }
    ctx.putImageData(image, 0, 0);
  }

  function describe(age: number, date: Date) {
    const title = phaseName(age);
    const line = `${Math.round(illumination(age) * 100)}% lit · ${dateFormat.format(date)}`;
    if (name.textContent !== title) name.textContent = title;
    if (detail.textContent !== line) {
      detail.textContent = line;
      root.setAttribute("aria-valuenow", String(Math.round(scrub)));
      root.setAttribute("aria-valuetext", `${title}, ${line}`);
    }
  }

  function tick(time: number) {
    frame = 0;
    const elapsed = Math.min(64, time - lastTime);
    lastTime = time;
    layout();

    const returning = !drag && time > holdUntil && scrub !== 0;
    if (returning) {
      scrub *= reducedMotion.matches ? 0 : Math.exp(-elapsed / 320);
      if (Math.abs(scrub) < 0.02) scrub = 0;
    }
    const now = new Date();
    const tonight = moonAge(now);
    const reveal = Math.min(1, Math.max(0, settings.current.progress));
    const days = scrub - (1 - reveal) * tonight;
    const age = (((tonight + days) % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH;
    const twinkle = reducedMotion.matches ? 0 : Math.floor(time / IDLE_FRAME_MS) * IDLE_FRAME_MS;
    const key = [layoutKey, age.toFixed(3), twinkle, slider("earthshine")].join("|");
    if (key !== paintedKey) {
      paintedKey = key;
      paint(age, twinkle);
      describe(age, new Date(now.getTime() + days * DAY_MS));
    }

    if (!visible) return;
    if (drag || returning || (reveal > 0 && reveal < 1)) frame = requestAnimationFrame(tick);
    else timer = window.setTimeout(wake, IDLE_FRAME_MS);
  }

  function wake() {
    window.clearTimeout(timer);
    if (!frame && visible) frame = requestAnimationFrame(tick);
  }

  function onPointerDown(event: PointerEvent) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    drag = { pointerId: event.pointerId, startX: event.clientX, startScrub: scrub };
    root.setPointerCapture(event.pointerId);
    wake();
  }

  function onPointerMove(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const rect = root.getBoundingClientRect();
    const scale = rect.width > 0 ? root.clientWidth / rect.width : 1;
    const diameters = ((event.clientX - drag.startX) * scale) / (radius * 2 * cell);
    scrub = drag.startScrub + diameters * (SYNODIC_MONTH / 2);
    wake();
  }

  function onPointerEnd(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag = null;
    wake();
  }

  function onKeyDown(event: KeyboardEvent) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    scrub += step;
    holdUntil = performance.now() + KEY_HOLD_MS;
    wake();
  }

  const resizeObserver = new ResizeObserver(wake);
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
    if (visible) wake();
    else window.clearTimeout(timer);
  });
  resizeObserver.observe(root);
  intersectionObserver.observe(root);
  root.addEventListener("pointerdown", onPointerDown);
  root.addEventListener("pointermove", onPointerMove);
  root.addEventListener("pointerup", onPointerEnd);
  root.addEventListener("pointercancel", onPointerEnd);
  root.addEventListener("keydown", onKeyDown);
  wake();

  return () => {
    cancelAnimationFrame(frame);
    window.clearTimeout(timer);
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    root.removeEventListener("pointerdown", onPointerDown);
    root.removeEventListener("pointermove", onPointerMove);
    root.removeEventListener("pointerup", onPointerEnd);
    root.removeEventListener("pointercancel", onPointerEnd);
    root.removeEventListener("keydown", onKeyDown);
  };
}

const LABEL_FONT = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

export function Example({
  sliders = SLIDERS,
  progress = 1,
}: { sliders?: Record<string, number>; progress?: number } = {}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nameRef = useRef<HTMLSpanElement>(null);
  const detailRef = useRef<HTMLSpanElement>(null);
  const settings = useRef({ sliders, progress });
  useLayoutEffect(() => {
    settings.current = { sliders, progress };
  }, [sliders, progress]);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const name = nameRef.current;
    const detail = detailRef.current;
    if (!root || !canvas || !name || !detail) return;
    return startMoon({ root, canvas, name, detail }, settings);
  }, []);

  return (
    <div
      ref={rootRef}
      role="slider"
      tabIndex={0}
      aria-label="Day of the lunar month"
      aria-orientation="horizontal"
      aria-valuemin={-15}
      aria-valuemax={15}
      aria-valuenow={0}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 280,
        overflow: "hidden",
        color: "#ffffff",
        cursor: "ew-resize",
        touchAction: "pan-y",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{ position: "absolute", top: 0, left: 0, imageRendering: "pixelated" }}
      />
      <div
        style={{
          position: "absolute",
          top: "var(--moon-label-top, 70%)",
          left: 0,
          right: 0,
          display: "grid",
          gap: 8,
          justifyItems: "center",
          font: `500 12px/1.2 ${LABEL_FONT}`,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          pointerEvents: "none",
        }}
      >
        <span ref={nameRef} />
        <span ref={detailRef} style={{ opacity: 0.74 }} />
      </div>
    </div>
  );
}
