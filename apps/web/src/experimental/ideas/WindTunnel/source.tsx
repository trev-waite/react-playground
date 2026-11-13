import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

const SLIDERS = {"windSpeed":8,"turbulence":10,"smokeLines":92};

const WORD = "Slipstream";
/** CSS pixels per cell of the flow field. */
const GRID = 4;
/** Distance between the puffs a nozzle leaves in still air. */
const SPACING = 5;
const DASH = { length: 20, lit: 16 };
/** Smoke that drifts into air this slow, such as the hollow of a letter, thins out and is no longer drawn. */
const STILL_AIR = 0.06;
const RESIZE_SETTLE_MS = 120;
const INK_CHECK_MS = 500;

const smoothstep = (low: number, high: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
};

/**
 * Distance in cells from every cell to the nearest solid one, by a two-pass
 * chamfer sweep. `solid` holds 1 for cells inside the obstacle.
 */
export function distanceField(solid: Uint8Array, width: number, height: number): Float32Array {
  const far = width + height;
  const distance = Float32Array.from(solid, cell => (cell ? 0 : far));
  const relax = (i: number, x: number, y: number, dx: number, dy: number, cost: number) => {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= width || ny < 0 || ny >= height) return;
    const through = distance[ny * width + nx]! + cost;
    if (through < distance[i]!) distance[i] = through;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      relax(i, x, y, -1, 0, 1);
      relax(i, x, y, 0, -1, 1);
      relax(i, x, y, -1, -1, Math.SQRT2);
      relax(i, x, y, 1, -1, Math.SQRT2);
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      relax(i, x, y, 1, 0, 1);
      relax(i, x, y, 0, 1, 1);
      relax(i, x, y, 1, 1, Math.SQRT2);
      relax(i, x, y, -1, 1, Math.SQRT2);
    }
  }
  return distance;
}

/** Averages each cell with its neighbors a few times, so the flow built on the field has no creases. */
function soften(field: Float32Array, width: number, height: number, passes: number): Float32Array {
  let from = field;
  for (let pass = 0; pass < passes; pass++) {
    const to = new Float32Array(from.length);
    for (let y = 0; y < height; y++) {
      const up = Math.max(0, y - 1) * width;
      const down = Math.min(height - 1, y + 1) * width;
      for (let x = 0; x < width; x++) {
        const left = Math.max(0, x - 1);
        const right = Math.min(width - 1, x + 1);
        const row = y * width;
        to[row + x] =
          (from[up + left]! + from[up + right]! + from[down + left]! + from[down + right]!) / 16 +
          (from[up + x]! + from[down + x]! + from[row + left]! + from[row + right]!) / 8 +
          from[row + x]! / 4;
      }
    }
    from = to;
  }
  return from;
}

export type Flow = { u: Float32Array; v: Float32Array; width: number; height: number };

/**
 * Steady flow from left to right around an obstacle, as velocities per cell in
 * units of the free stream. It comes from a stream function that equals the
 * height far away and the centerline's height on the obstacle, so the field
 * has no sources or sinks, nothing crosses the obstacle, and air speeds up
 * where it squeezes past, as it does over a wing.
 */
export function flowField(solid: Uint8Array, width: number, height: number, centerline: number, reach: number): Flow {
  const open = soften(
    distanceField(solid, width, height).map(distance => smoothstep(0, reach, distance)),
    width,
    height,
    6,
  );
  const stream = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      stream[i] = centerline + (y - centerline) * open[i]!;
    }
  }
  const u = new Float32Array(width * height);
  const v = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const up = Math.max(0, y - 1);
    const down = Math.min(height - 1, y + 1);
    for (let x = 0; x < width; x++) {
      const left = Math.max(0, x - 1);
      const right = Math.min(width - 1, x + 1);
      const i = y * width + x;
      u[i] = (stream[down * width + x]! - stream[up * width + x]!) / (down - up);
      v[i] = -(stream[y * width + right]! - stream[y * width + left]!) / (right - left);
    }
  }
  return { u, v, width, height };
}

/** The flow at a point in cell coordinates, blended from the four cells around it. */
export function sampleFlow(flow: Flow, x: number, y: number): [number, number] {
  const cx = Math.min(flow.width - 1.001, Math.max(0, x));
  const cy = Math.min(flow.height - 1.001, Math.max(0, y));
  const ix = Math.floor(cx);
  const iy = Math.floor(cy);
  const fx = cx - ix;
  const fy = cy - iy;
  const i = iy * flow.width + ix;
  const blend = (field: Float32Array) =>
    (field[i]! * (1 - fx) + field[i + 1]! * fx) * (1 - fy) +
    (field[i + flow.width]! * (1 - fx) + field[i + flow.width + 1]! * fx) * fy;
  return [blend(flow.u), blend(flow.v)];
}

type Settings = { sliders: Record<string, number>; progress: number };

/** One smoke nozzle's puffs, oldest overwritten first. `lit` leaves gaps so the eye can follow the air. */
type Filament = { x: Float32Array; y: Float32Array; lit: Uint8Array; head: number; emitted: number };

/**
 * Runs the tunnel. A rake of nozzles on the left releases smoke puffs that
 * ride the flow field around the word; each nozzle's puffs are joined into a
 * line, as in smoke-wire photographs. Behind the word the air turns unsteady,
 * and the pointer stands in the stream as a cylinder.
 */
function startTunnel(root: HTMLElement, canvas: HTMLCanvasElement, settings: RefObject<Settings>): () => void {
  const context = canvas.getContext("2d");
  if (!context) return () => {};
  const ctx = context;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let width = 0;
  let height = 0;
  let dpr = 1;
  let fontSize = 16;
  let font = "";
  let word = { baseline: 0, left: 0, right: 0 };
  let flow: Flow = { u: new Float32Array(4).fill(1), v: new Float32Array(4), width: 2, height: 2 };
  let filaments: Filament[] = [];
  let builtFor = "";
  let ink = "#000";
  let inkCheckedAt = -Infinity;
  let travelled = 0;
  let clock = 0;
  let pointer = { x: 0, y: 0, strength: 0, inside: false };
  let visible = true;
  let frame = 0;
  let settle = 0;
  let lastTime = 0;

  const slider = (key: keyof typeof SLIDERS) => (settings.current.sliders[key] ?? SLIDERS[key]) / 100;

  function build() {
    width = root.clientWidth;
    height = root.clientHeight;
    if (width < 2 || height < 2) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    fontSize = Math.min(Math.max(width * 0.135, Math.min(width * 0.175, 64)), height * 0.4);
    font = `italic 800 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.font = font;
    const metrics = ctx.measureText(WORD);
    const left = (width - metrics.width) / 2;
    word = {
      baseline: height / 2 + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2,
      left,
      right: left + metrics.width,
    };

    const columns = Math.ceil(width / GRID) + 1;
    const rows = Math.ceil(height / GRID) + 1;
    const mask = document.createElement("canvas");
    mask.width = columns;
    mask.height = rows;
    const maskContext = mask.getContext("2d", { willReadFrequently: true });
    const solid = new Uint8Array(columns * rows);
    if (maskContext) {
      maskContext.scale(1 / GRID, 1 / GRID);
      maskContext.font = font;
      maskContext.fillText(WORD, word.left, word.baseline);
      const pixels = maskContext.getImageData(0, 0, columns, rows).data;
      for (let i = 0; i < solid.length; i++) solid[i] = pixels[i * 4 + 3]! > 60 ? 1 : 0;
    }
    flow = flowField(solid, columns, rows, height / 2 / GRID, (fontSize * 0.34) / GRID);

    const pitch = Math.max(12, fontSize * (0.22 - slider("smokeLines") * 0.16));
    const count = Math.min(64, Math.max(6, Math.round(height / pitch)));
    const capacity = Math.ceil(((width + 60) / SPACING) * 2.2);
    filaments = Array.from({ length: count }, (_, index) => {
      const filament: Filament = {
        x: new Float32Array(capacity).fill(width + 100),
        y: new Float32Array(capacity),
        lit: new Uint8Array(capacity),
        head: 0,
        emitted: (index * 7) % DASH.length,
      };
      const trail: [number, number][] = [];
      let x = -20;
      let y = (height * (index + 0.5)) / count;
      while (x < width + 30 && trail.length < capacity) {
        trail.push([x, y]);
        const [u, v] = sampleFlow(flow, x / GRID, y / GRID);
        const speed = Math.hypot(u, v);
        if (speed < 0.03) break;
        x += (u / speed) * SPACING;
        y += (v / speed) * SPACING;
      }
      for (let k = trail.length - 1; k >= 0; k--) release(filament, trail[k]![0], trail[k]![1]);
      return filament;
    });
    builtFor = [root.clientWidth, root.clientHeight, slider("smokeLines")].join("|");
  }

  function release(filament: Filament, x: number, y: number) {
    filament.head = (filament.head + 1) % filament.x.length;
    filament.x[filament.head] = x;
    filament.y[filament.head] = y;
    filament.lit[filament.head] = filament.emitted % DASH.length < DASH.lit ? 1 : 0;
    filament.emitted += 1;
  }

  function step(seconds: number) {
    const speed = (60 + slider("windSpeed") * 260) * (fontSize / 100) * Math.min(1, Math.max(0, settings.current.progress));
    const gust = slider("turbulence") * 1.5;
    const scale = 100 / fontSize;
    const span = fontSize * 0.75;
    const post = fontSize * 0.36;
    const move = speed * seconds;
    clock += seconds;
    pointer.strength += ((pointer.inside ? 1 : 0) - pointer.strength) * (1 - Math.exp(-seconds * 9));

    for (const filament of filaments) {
      const { x: xs, y: ys } = filament;
      for (let i = 0; i < xs.length; i++) {
        const x = xs[i]!;
        const y = ys[i]!;
        if (x > width + 40) continue;
        let [u, v] = sampleFlow(flow, x / GRID, y / GRID);
        const open = Math.min(1, Math.hypot(u, v));
        if (open < STILL_AIR) filament.lit[i] = 0;
        const wake = smoothstep(word.right - fontSize * 1.5, word.right + fontSize * 0.5, x) * Math.exp(-(((y - height / 2) / span) ** 2));
        if (wake > 0.01 && gust > 0) {
          const b = 0.017 * scale * y + 0.9 * clock;
          const a = 0.021 * scale * x - 2.3 * clock + 1.6 * Math.sin(b);
          const d = 0.031 * scale * x - 1.1 * clock;
          const c = 0.043 * scale * y + 1.7 * clock + 1.3 * Math.cos(d);
          const amount = gust * wake * open * open * 10;
          u += amount * (Math.cos(a) * 1.6 * Math.cos(b) * 0.017 + 0.6 * Math.cos(c) * 0.043);
          v -= amount * (Math.cos(a) * 0.021 - 0.6 * Math.cos(c) * 1.3 * Math.sin(d) * 0.031);
        }
        let nextX = x + u * move;
        let nextY = y + v * move;
        if (pointer.strength > 0.01) {
          const dx = nextX - pointer.x;
          const dy = nextY - pointer.y;
          const reach = dx * dx + dy * dy;
          if (reach < post * post * 25) {
            const bend = (pointer.strength * post * post * move) / Math.max(reach * reach, post ** 4);
            nextX -= bend * (dx * dx - dy * dy);
            nextY -= bend * 2 * dx * dy;
            const away = Math.hypot(nextX - pointer.x, nextY - pointer.y);
            const wall = post * pointer.strength;
            if (away < wall && away > 0.001) {
              nextX = pointer.x + ((nextX - pointer.x) / away) * wall;
              nextY = pointer.y + ((nextY - pointer.y) / away) * wall;
            }
          }
        }
        xs[i] = nextX;
        ys[i] = nextY;
      }
    }

    travelled += move;
    while (travelled >= SPACING) {
      travelled -= SPACING;
      filaments.forEach((filament, index) => release(filament, -20 + travelled, (height * (index + 0.5)) / filaments.length));
    }
  }

  function draw(time: number) {
    if (time - inkCheckedAt > INK_CHECK_MS) {
      inkCheckedAt = time;
      ink = getComputedStyle(root).color || ink;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    const gap = (SPACING * 12) ** 2;
    ctx.beginPath();
    for (const filament of filaments) {
      const { x: xs, y: ys, lit, head } = filament;
      const size = xs.length;
      let drawing = false;
      let lastX = 0;
      let lastY = 0;
      for (let k = 1; k <= size; k++) {
        const i = (head + k) % size;
        const x = xs[i]!;
        const y = ys[i]!;
        if (!lit[i] || x > width + 30) {
          drawing = false;
          continue;
        }
        if (drawing && (x - lastX) ** 2 + (y - lastY) ** 2 < gap) {
          ctx.quadraticCurveTo(lastX, lastY, (lastX + x) / 2, (lastY + y) / 2);
        } else {
          ctx.moveTo(x, y);
        }
        drawing = true;
        lastX = x;
        lastY = y;
      }
    }
    ctx.globalAlpha = 0.72;
    ctx.lineWidth = Math.max(1, fontSize / 80);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.font = font;
    ctx.fillText(WORD, word.left, word.baseline);
  }

  function tick(time: number) {
    frame = 0;
    const seconds = Math.min(0.034, Math.max(0, (time - lastTime) / 1000));
    lastTime = time;
    if (builtFor.split("|")[2] !== String(slider("smokeLines"))) build();
    if (!reducedMotion.matches) step(seconds);
    draw(time);
    if (visible && !reducedMotion.matches) frame = requestAnimationFrame(tick);
  }

  function wake() {
    if (frame || !visible) return;
    lastTime = performance.now();
    frame = requestAnimationFrame(tick);
  }

  function onPointerMove(event: PointerEvent) {
    const rect = root.getBoundingClientRect();
    if (rect.width < 1) return;
    const scale = root.clientWidth / rect.width;
    pointer = { ...pointer, x: (event.clientX - rect.left) * scale, y: (event.clientY - rect.top) * scale, inside: true };
  }

  function onPointerLeave() {
    pointer = { ...pointer, inside: false };
  }

  const resizeObserver = new ResizeObserver(() => {
    window.clearTimeout(settle);
    settle = window.setTimeout(() => {
      build();
      wake();
    }, builtFor ? RESIZE_SETTLE_MS : 0);
  });
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
    wake();
  });
  resizeObserver.observe(root);
  intersectionObserver.observe(root);
  root.addEventListener("pointermove", onPointerMove);
  root.addEventListener("pointerdown", onPointerMove);
  root.addEventListener("pointerleave", onPointerLeave);
  root.addEventListener("pointerup", onPointerLeave);
  root.addEventListener("pointercancel", onPointerLeave);
  reducedMotion.addEventListener("change", wake);

  return () => {
    cancelAnimationFrame(frame);
    window.clearTimeout(settle);
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    root.removeEventListener("pointermove", onPointerMove);
    root.removeEventListener("pointerdown", onPointerMove);
    root.removeEventListener("pointerleave", onPointerLeave);
    root.removeEventListener("pointerup", onPointerLeave);
    root.removeEventListener("pointercancel", onPointerLeave);
    reducedMotion.removeEventListener("change", wake);
  };
}

export function Example({
  sliders = SLIDERS,
  progress = 1,
}: { sliders?: Record<string, number>; progress?: number } = {}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settings = useRef({ sliders, progress });
  useLayoutEffect(() => {
    settings.current = { sliders, progress };
  }, [sliders, progress]);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    return startTunnel(root, canvas, settings);
  }, []);

  return (
    <div
      ref={rootRef}
      role="img"
      aria-label={`${WORD}, with smoke streaming around the letters`}
      style={{ position: "relative", width: "100%", height: "100%", minHeight: 220, touchAction: "pan-y" }}
    >
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
    </div>
  );
}
