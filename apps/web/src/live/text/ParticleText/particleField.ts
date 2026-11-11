import {
  BURST_BRUSH,
  DESIGN_FONT_PX,
  HINT_BRUSH,
  POINTER_BRUSH,
  frameScale,
  hintOrigin,
  hintPosition,
  particleDisplacement,
  restingParticle,
  scaleBrush,
  smoothstep,
  type Brush,
  type Particle,
} from "./particleMath";
import { ParticleSim } from "./particleSim";

export type ParticleFieldElements = {
  root: HTMLElement;
  text: HTMLElement;
  canvas: HTMLCanvasElement;
};

type InkSample = { x: number; y: number; cellX: number; cellY: number; alpha: number };

type InkAtlas = {
  canvas: HTMLCanvasElement;
  pad: number;
  cssWidth: number;
  cssHeight: number;
  step: number;
  dpr: number;
};

type Box = { left: number; top: number; right: number; bottom: number };

const MAX_DPR = 3;
const CELL_PX = 2;
const DOT_PX = 1.7;
const ALPHA_MIN = Math.round(0.05 * 255);
const DISSOLVING_ATTR = "data-dissolving";
const ALPHA_LEVELS = 12;
const FAR_FADE_START = 10;
const FAR_FADE_END = 70;
const EDGE_FADE = 16;
const BRUSH_VELOCITY_DECAY = 0.72;
const GRID_CELL = 24;
const DIRTY_PAD = 2;

function effectiveDpr(): number {
  return Math.min(window.devicePixelRatio || 1, MAX_DPR);
}

function hash01(value: number): number {
  const t = Math.sin(value) * 43758.5453123;
  return t - Math.floor(t);
}

/**
 * Rasterizes the text into a grid of ink cells. A pointer brush blows them
 * off as dots that drift and then swirl home to reform the glyphs. The DOM
 * text stays the source of truth: while no cell is lifted, the canvas is
 * blank and the real text shows.
 *
 * Each frame touches only the particles in motion and repaints only the
 * region they cover now or covered last frame, so an idle shimmer costs a
 * few dozen particles and a small patch of canvas.
 */
export class ParticleField {
  private readonly ctx: CanvasRenderingContext2D;
  private frame: number | null = null;
  private lastFrameTime = 0;
  private timeMs = 0;
  private visible = true;
  private dissolving = false;
  private disposed = false;

  private particles: Particle[] = [];
  private sim = new ParticleSim([], GRID_CELL);
  private level = new Uint8Array(0);
  private bucket = new Uint8Array(0);
  private order = new Int32Array(0);
  private readonly levelStart = new Int32Array(ALPHA_LEVELS + 2);
  private cellX = new Int32Array(0);
  private cellY = new Int32Array(0);
  private rasterKey = "";
  private ink: InkAtlas | null = null;
  private fill = "#000";
  private unit = 1;
  private hint: { x: number; y: number } | null = null;
  private hintBrush: Brush = { ...HINT_BRUSH, x: 0, y: 0, vx: 0, vy: 0 };

  private originX = 0;
  private originY = 0;
  private canvasWidth = 0;
  private canvasHeight = 0;
  private painted: Box | null = null;
  private repaintAll = true;

  private brush: Brush | null = null;
  private lastPointer: { x: number; y: number; time: number } | null = null;
  private pointerId: number | null = null;

  private readonly resizeObserver = new ResizeObserver(() => this.refresh());
  private readonly intersectionObserver = new IntersectionObserver(([entry]) => {
    this.visible = entry?.isIntersecting ?? true;
    if (this.visible) this.animate();
  });

  constructor(
    private readonly elements: ParticleFieldElements,
    private readonly idleHint: boolean,
  ) {
    const ctx = elements.canvas.getContext("2d");
    if (!ctx) throw new Error("ParticleText needs a 2d canvas context");
    this.ctx = ctx;

    const text = elements.text;
    text.addEventListener("pointerenter", this.onPointerEnter);
    text.addEventListener("pointerdown", this.onPointerDown);
    text.addEventListener("pointermove", this.onPointerMove);
    text.addEventListener("pointerleave", this.onPointerLeave);
    text.addEventListener("pointerup", this.onPointerEnd);
    text.addEventListener("pointercancel", this.onPointerEnd);
    elements.root.addEventListener("transitionend", this.onInkChange);
    this.resizeObserver.observe(elements.root);
    this.intersectionObserver.observe(elements.root);
    void document.fonts?.ready.then(() => this.refresh());
    this.refresh();
  }

  dispose() {
    this.disposed = true;
    this.stop();
    this.resizeObserver.disconnect();
    this.intersectionObserver.disconnect();
    const text = this.elements.text;
    text.removeEventListener("pointerenter", this.onPointerEnter);
    text.removeEventListener("pointerdown", this.onPointerDown);
    text.removeEventListener("pointermove", this.onPointerMove);
    text.removeEventListener("pointerleave", this.onPointerLeave);
    text.removeEventListener("pointerup", this.onPointerEnd);
    text.removeEventListener("pointercancel", this.onPointerEnd);
    this.elements.root.removeEventListener("transitionend", this.onInkChange);
    this.setDissolving(false);
    this.clear();
  }

  private readonly onInkChange = (event: TransitionEvent) => {
    if (event.target !== this.elements.root || event.propertyName !== "color") return;
    this.syncFill();
    this.animate();
  };

  private readonly onPointerEnter = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    this.beginPointer(event);
  };

  private readonly onPointerDown = (event: PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.pointerType !== "mouse") {
      event.preventDefault();
      this.elements.text.setPointerCapture(event.pointerId);
    }
    this.beginPointer(event);
    if (this.brush) this.burst(this.brush.x, this.brush.y);
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    if (this.pointerId !== null && event.pointerId !== this.pointerId) return;
    if (this.pointerId === null && event.pointerType !== "mouse") return;
    this.movePointer(event);
  };

  private readonly onPointerLeave = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    this.onPointerEnd(event);
  };

  private readonly onPointerEnd = (event: PointerEvent) => {
    if (this.pointerId !== null && event.pointerId !== this.pointerId) return;
    if (this.elements.text.hasPointerCapture(event.pointerId)) {
      this.elements.text.releasePointerCapture(event.pointerId);
    }
    this.pointerId = null;
    this.brush = null;
    this.lastPointer = null;
    this.animate();
  };

  private beginPointer(event: PointerEvent) {
    this.pointerId = event.pointerId;
    const local = this.toLocal(event);
    if (!local) return;
    this.syncFill();
    this.lastPointer = { ...local, time: performance.now() };
    this.brush = { ...scaleBrush(POINTER_BRUSH, this.unit), ...local, vx: 0, vy: 0 };
    this.animate();
  }

  /** A press blows a wide hole in the text at once. */
  private burst(x: number, y: number) {
    this.sim.impulse({ ...scaleBrush(BURST_BRUSH, this.unit), x, y, vx: 0, vy: 0 });
    this.animate();
  }

  private movePointer(event: PointerEvent) {
    const local = this.toLocal(event);
    if (!local) return;
    const now = performance.now();
    let vx = 0;
    let vy = 0;
    if (this.lastPointer) {
      const dt = Math.max(1, now - this.lastPointer.time);
      vx = (local.x - this.lastPointer.x) / dt;
      vy = (local.y - this.lastPointer.y) / dt;
    }
    this.lastPointer = { ...local, time: now };
    this.brush = { ...scaleBrush(POINTER_BRUSH, this.unit), ...local, vx, vy };
    this.animate();
  }

  /** Pointer position in the text's own (unscaled) layout pixels, so it works inside a CSS-scaled parent. */
  private toLocal(event: PointerEvent): { x: number; y: number } | null {
    const text = this.elements.text;
    const rect = text.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1 || text.offsetWidth < 1) return null;
    const scale = rect.width / text.offsetWidth;
    return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
  }

  private refresh() {
    if (this.disposed) return;
    this.relayout(false);
    this.animate();
  }

  /** All layout and style reads happen here, on resize, font load, or a display change, never per frame. A new ink alone only re-reads the fill. */
  private relayout(force: boolean) {
    this.syncFill();
    this.syncCanvasSize();
    this.rebuild(force);
    const dpr = effectiveDpr();
    const { text, canvas } = this.elements;
    this.originX = Math.round((text.offsetLeft - canvas.offsetLeft) * dpr) / dpr;
    this.originY = Math.round((text.offsetTop - canvas.offsetTop) * dpr) / dpr;
    this.canvasWidth = canvas.clientWidth;
    this.canvasHeight = canvas.clientHeight;
    this.repaintAll = true;
  }

  private animate() {
    if (this.frame !== null || this.disposed || !this.visible) return;
    this.lastFrameTime = performance.now();
    const tick = (time: number) => {
      this.frame = null;
      if (this.disposed) return;
      const dt = Math.min(48, Math.max(0, time - this.lastFrameTime));
      this.lastFrameTime = time;
      if (this.visible && this.render(dt)) {
        this.frame = requestAnimationFrame(tick);
        return;
      }
      this.setDissolving(false);
      this.clear();
    };
    this.frame = requestAnimationFrame(tick);
  }

  private stop() {
    if (this.frame === null) return;
    cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  private render(dtMs: number): boolean {
    if (this.ink && Math.abs(this.ink.dpr - effectiveDpr()) > 0.001) this.relayout(true);
    const count = this.particles.length;
    if (count === 0) return false;

    this.timeMs += dtMs;
    const frame = frameScale(dtMs);
    const unit = this.unit;
    const pointer = this.brush;
    const brushes: Brush[] = pointer ? [pointer] : [];
    if (this.idleHint && this.hint) {
      Object.assign(this.hintBrush, hintPosition(this.hint, this.timeMs, unit));
      brushes.push(this.hintBrush);
    }
    const { lifting, fullyLifted, busy } = this.sim.step(dtMs, frame, unit, this.timeMs, brushes);
    if (pointer) {
      pointer.vx *= Math.pow(BRUSH_VELOCITY_DECAY, frame);
      pointer.vy *= Math.pow(BRUSH_VELOCITY_DECAY, frame);
    }

    const keepGoing = busy || brushes.length > 0;
    const ink = this.ink;
    if (lifting === 0 || !ink) {
      this.setDissolving(false);
      this.clear();
      return keepGoing;
    }
    this.setDissolving(true);
    this.draw(ink, fullyLifted < count);
    return true;
  }

  private draw(ink: InkAtlas, drawInk: boolean) {
    const ctx = this.ctx;
    const dpr = ink.dpr;
    const { originX, originY, canvasWidth: width, canvasHeight: height } = this;
    const active = this.sim.activeIndices;
    const lifts = this.sim.lift;
    const cell = ink.step / dpr;
    const dot = Math.max(1.1, DOT_PX * Math.sqrt(this.unit));
    const unit = this.unit;
    const box: Box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };

    for (const i of active) {
      const lift = lifts[i]!;
      if (lift <= 0) {
        this.level[i] = 0;
        continue;
      }
      const particle = this.particles[i]!;
      const x = originX + particle.x;
      const y = originY + particle.y;
      const homeX = originX + particle.homeX;
      const homeY = originY + particle.homeY;
      box.left = Math.min(box.left, x - dot, homeX - cell);
      box.top = Math.min(box.top, y - dot, homeY - cell);
      box.right = Math.max(box.right, x + dot, homeX + cell);
      box.bottom = Math.max(box.bottom, y + dot, homeY + cell);
      const far = smoothstep(FAR_FADE_START * unit, FAR_FADE_END * unit, particleDisplacement(particle));
      const edge = smoothstep(0, EDGE_FADE * unit, Math.min(x, y, width - x, height - y));
      const alpha = Math.min(1, 0.6 + 0.4 * lift) * (0.7 + particle.alpha * 0.3) * (1 - 0.6 * far) * edge;
      this.level[i] = Math.ceil(alpha * ALPHA_LEVELS);
    }

    const clip = this.repaintAll ? null : this.union(box, this.painted);
    this.painted = box;
    this.repaintAll = false;
    const canvas = this.elements.canvas;
    const left = clip ? Math.max(0, Math.floor((clip.left - DIRTY_PAD) * dpr)) : 0;
    const top = clip ? Math.max(0, Math.floor((clip.top - DIRTY_PAD) * dpr)) : 0;
    const right = clip ? Math.min(canvas.width, Math.ceil((clip.right + DIRTY_PAD) * dpr)) : canvas.width;
    const bottom = clip ? Math.min(canvas.height, Math.ceil((clip.bottom + DIRTY_PAD) * dpr)) : canvas.height;
    if (right <= left || bottom <= top) return;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath();
    ctx.rect(left, top, right - left, bottom - top);
    ctx.clip();
    ctx.clearRect(left, top, right - left, bottom - top);

    const atlasX = originX - ink.pad;
    const atlasY = originY - ink.pad;
    if (drawInk) {
      const deviceX = Math.round(atlasX * dpr);
      const deviceY = Math.round(atlasY * dpr);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(ink.canvas, deviceX, deviceY);
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "#000";
      this.fillByLevel(active, i => Math.ceil(lifts[i]! * ALPHA_LEVELS), i => {
        ctx.rect(deviceX + this.cellX[i]!, deviceY + this.cellY[i]!, ink.step, ink.step);
      });
      ctx.globalAlpha = 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = this.fill;
      ctx.fillRect(atlasX, atlasY, ink.cssWidth, ink.cssHeight);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = this.fill;
    this.fillByLevel(active, i => this.level[i]!, i => {
      const particle = this.particles[i]!;
      const lift = lifts[i]!;
      const size = cell + (dot * (0.75 + particle.seed * 0.5) - cell) * lift;
      const half = size * 0.5;
      const x = originX + particle.x;
      const y = originY + particle.y;
      if (lift < 1) {
        ctx.roundRect(x - half, y - half, size, size, half * lift);
      } else {
        ctx.moveTo(x + half, y);
        ctx.arc(x, y, half, 0, Math.PI * 2);
      }
    });
    ctx.restore();
  }

  private union(box: Box, other: Box | null): Box {
    if (!other) return box;
    return {
      left: Math.min(box.left, other.left),
      top: Math.min(box.top, other.top),
      right: Math.max(box.right, other.right),
      bottom: Math.max(box.bottom, other.bottom),
    };
  }

  /** Buckets shapes by alpha level in one counting pass, then fills each level as a single path. */
  private fillByLevel(indices: Int32Array, levelOf: (index: number) => number, addShape: (index: number) => void) {
    const ctx = this.ctx;
    const start = this.levelStart;
    start.fill(0);
    for (const i of indices) {
      const level = levelOf(i);
      this.bucket[i] = level;
      start[level + 1]!++;
    }
    for (let level = 0; level <= ALPHA_LEVELS; level++) start[level + 1]! += start[level]!;
    const cursor = start.slice();
    for (const i of indices) this.order[cursor[this.bucket[i]!]!++] = i;
    for (let level = 1; level <= ALPHA_LEVELS; level++) {
      if (start[level] === start[level + 1]) continue;
      ctx.beginPath();
      for (let k = start[level]!; k < start[level + 1]!; k++) addShape(this.order[k]!);
      ctx.globalAlpha = level / ALPHA_LEVELS;
      ctx.fill();
    }
  }

  private syncFill() {
    const fill = getComputedStyle(this.elements.root).color || "#000";
    if (fill !== this.fill) this.repaintAll = true;
    this.fill = fill;
  }

  private setDissolving(active: boolean) {
    if (this.dissolving === active) return;
    this.dissolving = active;
    this.elements.text.toggleAttribute(DISSOLVING_ATTR, active);
  }

  private syncCanvasSize() {
    const canvas = this.elements.canvas;
    const dpr = effectiveDpr();
    const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  private clear() {
    if (this.painted === null && !this.repaintAll) return;
    const canvas = this.elements.canvas;
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.ctx.restore();
    this.painted = null;
    this.repaintAll = true;
  }

  private rebuild(force: boolean) {
    const samples = this.rasterize(force);
    if (!samples) return;

    const previous = this.particles;
    this.particles = samples.map((sample, i) => {
      const seeds = {
        alpha: sample.alpha,
        seed: hash01(sample.x * 43.117 + sample.y * 19.441),
        gate: hash01(sample.x * 91.337 + sample.y * 17.823),
      };
      const old = previous[i];
      if (old && Math.hypot(old.homeX - sample.x, old.homeY - sample.y) < 1.5) {
        return { ...old, ...seeds, homeX: sample.x, homeY: sample.y };
      }
      return restingParticle(sample.x, sample.y, seeds.alpha, seeds.seed, seeds.gate);
    });

    const count = samples.length;
    this.sim = new ParticleSim(this.particles, GRID_CELL * this.unit);
    this.level = new Uint8Array(count);
    this.bucket = new Uint8Array(count);
    this.order = new Int32Array(count);
    this.cellX = new Int32Array(count);
    this.cellY = new Int32Array(count);
    samples.forEach((sample, i) => {
      this.cellX[i] = sample.cellX;
      this.cellY[i] = sample.cellY;
    });
    this.hint = hintOrigin(samples, this.unit);
    this.hintBrush = { ...scaleBrush(HINT_BRUSH, this.unit), x: 0, y: 0, vx: 0, vy: 0 };
  }

  private rasterize(force: boolean): InkSample[] | null {
    const text = this.elements.text;
    const style = getComputedStyle(text);
    const dpr = effectiveDpr();
    const content = text.textContent?.trim() ?? "";
    const key = [
      content,
      style.font,
      style.letterSpacing,
      style.textTransform,
      text.offsetWidth,
      text.offsetHeight,
      dpr,
    ].join("|");
    if (!force && key === this.rasterKey) return null;
    this.rasterKey = key;

    const width = text.offsetWidth;
    const height = text.offsetHeight;
    const fontSize = parseFloat(style.fontSize) || 16;
    this.unit = fontSize / DESIGN_FONT_PX;
    const pad = Math.ceil(fontSize * 0.45);
    const cssWidth = Math.ceil(width) + pad * 2;
    const cssHeight = Math.ceil(height) + pad * 2;
    const atlas = document.createElement("canvas");
    atlas.width = Math.max(1, Math.round(cssWidth * dpr));
    atlas.height = Math.max(1, Math.round(cssHeight * dpr));
    const ctx = atlas.getContext("2d", { willReadFrequently: true });
    if (!ctx || !content) {
      this.ink = null;
      return [];
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#000";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    if (style.letterSpacing && style.letterSpacing !== "normal") ctx.letterSpacing = style.letterSpacing;
    const label = style.textTransform === "uppercase" ? content.toUpperCase() : content;
    const metrics = ctx.measureText(label);
    const ascent = metrics.fontBoundingBoxAscent || fontSize * 0.8;
    const descent = metrics.fontBoundingBoxDescent || fontSize * 0.2;
    const lineHeight = parseFloat(style.lineHeight) || ascent + descent;
    const baseline = (height - lineHeight) / 2 + (lineHeight - (ascent + descent)) / 2 + ascent;
    ctx.fillText(label, pad + width / 2, pad + baseline);

    const { data } = ctx.getImageData(0, 0, atlas.width, atlas.height);
    const step = Math.max(1, Math.round(CELL_PX * dpr));
    const samples: InkSample[] = [];
    for (let py = 0; py < atlas.height; py += step) {
      for (let px = 0; px < atlas.width; px += step) {
        let alpha = 0;
        const maxY = Math.min(py + step, atlas.height);
        const maxX = Math.min(px + step, atlas.width);
        scan: for (let cy = py; cy < maxY; cy++) {
          for (let cx = px; cx < maxX; cx++) {
            alpha = Math.max(alpha, data[(cy * atlas.width + cx) * 4 + 3]!);
            if (alpha === 255) break scan;
          }
        }
        if (alpha < ALPHA_MIN) continue;
        samples.push({
          x: (px + step * 0.5) / dpr - pad,
          y: (py + step * 0.5) / dpr - pad,
          cellX: px,
          cellY: py,
          alpha: alpha / 255,
        });
      }
    }

    this.ink = { canvas: atlas, pad, cssWidth, cssHeight, step, dpr };
    return samples;
  }
}
