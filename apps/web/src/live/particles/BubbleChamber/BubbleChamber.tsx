import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

const SLIDERS = {"field":50,"beamRate":50,"persistence":40};

const MAX_BUBBLES = 14_000;
const STEP = 2;
const ALPHA_LEVELS = 6;
const FADE_SECONDS = 2;
const GROW_SECONDS = 0.6;
const INK_CHECK_MS = 500;
/**
 * Tracks travel in screen pixels per viewport, like CSS `vmin`, so a tile and
 * its page play at the same speed. At a desktop tile this matches `unit`.
 */
const TRAVEL_VMIN = 1340;
const SCREEN_CHECK_MS = 250;

/** A small seeded generator, so a still picture of the chamber is the same every time. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A charged particle crossing the chamber. `range` is the distance over which it loses most of its momentum. */
export type Track = {
  x: number;
  y: number;
  heading: number;
  momentum: number;
  charge: number;
  range: number;
  /** The track ends once its momentum falls this low. */
  stopBelow: number;
  /** A beam particle may strike a nucleus once it reaches this x. */
  vertexAt?: number;
  burst?: boolean;
  beam?: boolean;
};

/**
 * Moves a particle `distance` along its path. The magnetic field bends it into
 * a circle whose radius is its momentum over the field, turning one way for a
 * positive charge and the other for a negative one; the liquid slows it, so
 * the circle tightens into the spiral bubble-chamber pictures are known for.
 */
export function advanceTrack(track: Track, distance: number, field: number): void {
  track.heading += (track.charge * field * distance) / track.momentum;
  track.x += Math.cos(track.heading) * distance;
  track.y += Math.sin(track.heading) * distance;
  track.momentum *= Math.exp(-distance / track.range);
}

type Settings = { sliders: Record<string, number>; progress: number };

/**
 * Runs the chamber. Beam particles enter from the left; some strike a nucleus
 * and scatter into a spray of curling tracks, knock loose electrons that
 * spiral tightly, or leave a V where an unseen neutral particle decayed. Each
 * track is a trail of bubbles that swell, then fade. A click fires a beam
 * particle at that spot.
 */
function startChamber(canvas: HTMLCanvasElement, settings: RefObject<Settings>): () => void {
  const context = canvas.getContext("2d");
  if (!context) return () => {};
  const ctx = context;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const bubbleX = new Float32Array(MAX_BUBBLES);
  const bubbleY = new Float32Array(MAX_BUBBLES);
  const bubbleSize = new Float32Array(MAX_BUBBLES);
  const bornAt = new Float32Array(MAX_BUBBLES);
  let head = 0;
  let live = 0;
  let tracks: Track[] = [];
  let random = mulberry32(7);
  let width = 0;
  let height = 0;
  let unit = 1;
  let dpr = 1;
  let clock = 0;
  let nextSpillAt = 0;
  let ink = "#000";
  let inkCheckedAt = -Infinity;
  let visible = true;
  let frame = 0;
  let lastTime = 0;
  let screenScale = 1;
  let viewMin = 800;
  let screenCheckedAt = -Infinity;
  let developed = false;

  const slider = (key: keyof typeof SLIDERS) => (settings.current.sliders[key] ?? SLIDERS[key]) / 100;
  const between = (low: number, high: number) => low + (high - low) * random();
  const spread = (amount: number) => (random() + random() + random() - 1.5) * amount;

  function bubble(x: number, y: number, size: number) {
    head = (head + 1) % MAX_BUBBLES;
    bubbleX[head] = x;
    bubbleY[head] = y;
    bubbleSize[head] = size;
    bornAt[head] = clock;
    live = Math.min(MAX_BUBBLES, live + 1);
  }

  function beam(y: number, vertexAt?: number, burst = false) {
    tracks.push({ x: -10, y, heading: spread(0.02), momentum: 24_000 * unit, charge: 1, range: 1e7, stopBelow: 0, vertexAt, burst, beam: true });
  }

  /** A secondary particle. It travels `reach` times its own bending radius before it has slowed to a stop. */
  function secondary(x: number, y: number, heading: number, charge: number, momentum: number, reach: number) {
    tracks.push({ x, y, heading, momentum: momentum * unit, charge, range: momentum * unit * reach, stopBelow: momentum * unit * 0.3 });
  }

  function electron(x: number, y: number, heading: number, charge: number, momentum: number) {
    secondary(x, y, heading, charge, momentum, between(4, 10));
  }

  function pair(x: number, y: number, heading: number) {
    const momentum = between(22, 70);
    electron(x, y, heading + 0.05, 1, momentum);
    electron(x, y, heading - 0.05, -1, momentum * between(0.7, 1.2));
  }

  function collide(x: number, y: number, heading: number, burst: boolean) {
    const prongs = Math.round(burst ? between(5, 7) : between(2, 5));
    for (let index = 0; index < prongs; index++) {
      secondary(x, y, heading + spread(0.75), index % 2 ? 1 : -1, 34 * (1 + random() ** 2 * 22), between(5, 12));
    }
    if (random() < (burst ? 0.85 : 0.4)) {
      const bearing = heading + spread(0.5);
      const gap = between(46, 130) * unit;
      const [vx, vy] = [x + Math.cos(bearing) * gap, y + Math.sin(bearing) * gap];
      const momentum = between(70, 260);
      secondary(vx, vy, bearing + 0.13, 1, momentum, between(6, 14));
      secondary(vx, vy, bearing - 0.13, -1, momentum * 0.8, between(6, 14));
    }
    if (random() < (burst ? 0.7 : 0.3)) {
      const bearing = heading + spread(1.2);
      const gap = between(40, 150) * unit;
      pair(x + Math.cos(bearing) * gap, y + Math.sin(bearing) * gap, bearing);
    }
  }

  function advance(seconds: number) {
    const field = 0.35 + slider("field") * 1.5;
    clock += seconds;
    const next: Track[] = [];
    for (const track of tracks) {
      const reach = (track.beam ? 2600 : 1100) * (viewMin / screenScale / TRAVEL_VMIN) * seconds;
      let alive = true;
      for (let moved = 0; moved < reach && alive; moved += STEP) {
        advanceTrack(track, STEP, field);
        const slow = Math.min(1, (40 * unit) / track.momentum);
        if (random() < 0.5 + slow * 0.4) {
          const across = spread(0.9);
          bubble(
            track.x - Math.sin(track.heading) * across,
            track.y + Math.cos(track.heading) * across,
            (1.1 + slow * 0.5 + random() * 0.6) * Math.max(1, unit * 0.8),
          );
        }
        if (track.beam && random() < 0.0011) {
          electron(track.x, track.y, track.heading + (random() < 0.5 ? 1 : -1) * between(0.5, 1.3), -1, between(9, 34));
        }
        if (track.vertexAt !== undefined && track.x >= track.vertexAt) {
          collide(track.x, track.y, track.heading, track.burst === true);
          alive = false;
        }
        if (track.momentum < track.stopBelow || track.x < -40 || track.x > width + 40 || track.y < -40 || track.y > height + 40) {
          alive = false;
        }
      }
      if (alive) next.push(track);
    }
    tracks = next;
  }

  function spill() {
    const room = Math.min(1, (width * height) / 500_000);
    const count = Math.max(1, Math.round(between(2, 4) * room));
    for (let index = 0; index < count; index++) {
      beam(between(0.1, 0.9) * height, random() < 0.66 ? between(0.2, 0.8) * width : undefined);
    }
    nextSpillAt = clock + (2.4 - slider("beamRate") * 1.8) * (1.6 - room * 0.6) + between(0, 0.5);
  }

  function draw(time: number) {
    if (time - inkCheckedAt > INK_CHECK_MS) {
      inkCheckedAt = time;
      ink = getComputedStyle(canvas).color || ink;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;

    const arm = 5 * Math.max(1, unit);
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let column = 0; column < 4; column++) {
      for (let row = 0; row < 3; row++) {
        const x = Math.round((width * (column + 0.5)) / 4) + 0.5;
        const y = Math.round((height * (row + 0.5)) / 3) + 0.5;
        ctx.moveTo(x - arm, y);
        ctx.lineTo(x + arm, y);
        ctx.moveTo(x, y - arm);
        ctx.lineTo(x, y + arm);
      }
    }
    ctx.stroke();

    const hold = 1.2 + slider("persistence") * 5;
    let level = -1;
    for (let k = live - 1; k >= 0; k--) {
      const i = (head - k + MAX_BUBBLES) % MAX_BUBBLES;
      const age = clock - bornAt[i]!;
      const alpha = age < hold ? 1 : 1 - (age - hold) / FADE_SECONDS;
      if (alpha <= 0) {
        live = k;
        continue;
      }
      const nextLevel = Math.ceil(alpha * ALPHA_LEVELS);
      if (nextLevel !== level) {
        level = nextLevel;
        ctx.globalAlpha = level / ALPHA_LEVELS;
      }
      const size = bubbleSize[i]! * (0.55 + 0.45 * Math.min(1, age / GROW_SECONDS));
      ctx.fillRect(bubbleX[i]! - size / 2, bubbleY[i]! - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }

  /** With motion reduced, one finished photograph: the same event every time, fully developed. */
  function still() {
    developed = true;
    random = mulberry32(7);
    tracks = [];
    head = 0;
    live = 0;
    beam(height * 0.3);
    beam(height * 0.52, width * 0.38, true);
    beam(height * 0.74, width * 0.66);
    for (let guard = 0; guard < 400 && tracks.length > 0; guard++) advance(0.05);
    const born = clock;
    for (let i = 0; i < MAX_BUBBLES; i++) bornAt[i] = born;
    clock += GROW_SECONDS;
  }

  function measureScreen(time: number) {
    if (time - screenCheckedAt < SCREEN_CHECK_MS) return;
    screenCheckedAt = time;
    const rect = canvas.getBoundingClientRect();
    screenScale = rect.width > 0 && canvas.clientWidth > 0 ? rect.width / canvas.clientWidth : 1;
    viewMin = Math.min(window.innerWidth, window.innerHeight);
  }

  /** Keeps what is already in the chamber in place when the canvas changes size. */
  function rescale(sx: number, sy: number) {
    for (const track of tracks) {
      track.x *= sx;
      track.y *= sy;
      if (track.vertexAt !== undefined) track.vertexAt *= sx;
    }
    for (let i = 0; i < MAX_BUBBLES; i++) {
      bubbleX[i] = bubbleX[i]! * sx;
      bubbleY[i] = bubbleY[i]! * sy;
    }
  }

  function resize() {
    const nextWidth = canvas.clientWidth;
    const nextHeight = canvas.clientHeight;
    if (width > 1 && height > 1 && (nextWidth !== width || nextHeight !== height)) rescale(nextWidth / width, nextHeight / height);
    width = nextWidth;
    height = nextHeight;
    screenCheckedAt = -Infinity;
    measureScreen(performance.now());
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    unit = Math.max(0.6, Math.min(width, height) / 420);
    if (reducedMotion.matches) {
      if (!developed && width > 1) still();
    } else if (clock === 0 && width > 1 && settings.current.progress >= 0.5) {
      spill();
      for (let step = 0; step < 40; step++) advance(0.034);
    }
  }

  function tick(time: number) {
    frame = 0;
    const seconds = Math.min(0.034, Math.max(0, (time - lastTime) / 1000));
    lastTime = time;
    measureScreen(time);
    if (!reducedMotion.matches) {
      if (settings.current.progress >= 0.5 && clock >= nextSpillAt) spill();
      advance(seconds);
    }
    draw(time);
    if (visible && !reducedMotion.matches) frame = requestAnimationFrame(tick);
  }

  function wake() {
    if (frame || !visible) return;
    lastTime = performance.now();
    frame = requestAnimationFrame(tick);
  }

  function onClick(event: MouseEvent) {
    if (reducedMotion.matches) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1) return;
    const scale = canvas.clientWidth / rect.width;
    beam((event.clientY - rect.top) * scale, (event.clientX - rect.left) * scale, true);
    wake();
  }

  const resizeObserver = new ResizeObserver(() => {
    resize();
    wake();
  });
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
    wake();
  });
  const onMotionChange = () => {
    developed = false;
    resize();
    wake();
  };
  resizeObserver.observe(canvas);
  intersectionObserver.observe(canvas);
  canvas.addEventListener("click", onClick);
  reducedMotion.addEventListener("change", onMotionChange);

  return () => {
    cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    canvas.removeEventListener("click", onClick);
    reducedMotion.removeEventListener("change", onMotionChange);
  };
}

export function BubbleChamber({
  sliders = SLIDERS,
  progress = 1,
}: { sliders?: Record<string, number>; progress?: number } = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settings = useRef({ sliders, progress });
  useLayoutEffect(() => {
    settings.current = { sliders, progress };
  }, [sliders, progress]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return startChamber(canvas, settings);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Particle tracks curling through a bubble chamber"
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        minHeight: 220,
        cursor: "crosshair",
        touchAction: "manipulation",
      }}
    />
  );
}
