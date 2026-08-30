import { useEffect, useRef, type PointerEvent } from "react";
import {
  type ConstructId,
  clamp01,
  constructFrame,
  detailedEdges,
  detailedFacets,
  easeOutQuad,
  fillRings,
  guideVertices,
  hueFromColor,
  localProgress,
  mix,
  sampleConstruct,
  type Sample,
  type Vec2,
} from "./constructs";
import styles from "./EmeraldConstruct.module.css";

const MAX_DPR = 2;
const SETTLE_EPS = 0.0008;

export type EmeraldConstructProps = {
  formationSpeed: number;
  detail: number;
  color: number;
  variant?: ConstructId;
  /** Construction amount from 0 (dissolved) to 1 (complete). */
  progress?: number;
  /** Normalized canvas coordinates (0–1). Points emerge from here. */
  origin?: { x: number; y: number };
  onOriginChange?: (origin: { x: number; y: number }) => void;
  onPressChange?: (pressed: boolean, origin: { x: number; y: number }) => void;
  className?: string;
};

function originFromEvent(
  event: PointerEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width || 1;
  const height = rect.height || 1;
  return {
    x: (event.clientX - rect.left) / width,
    y: (event.clientY - rect.top) / height,
  };
}

function project(point: Vec2, cx: number, cy: number, scale: number, ox = 0, oy = 0): Vec2 {
  return { x: cx + (point.x - ox) * scale, y: cy + (point.y - oy) * scale };
}

function hsl(hue: number, sat: number, light: number, alpha = 1): string {
  if (alpha >= 1) return `hsl(${hue} ${sat}% ${light}%)`;
  return `hsl(${hue} ${sat}% ${light}% / ${alpha})`;
}

/**
 * Geometric construct assembled from sampled target points.
 * `progress` is the only time driver.
 */
export function EmeraldConstruct({
  formationSpeed,
  detail,
  color,
  variant = "bird",
  progress = 0,
  origin = { x: 0.5, y: 0.5 },
  onOriginChange,
  onPressChange,
  className,
}: EmeraldConstructProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paramsRef = useRef({
    formationSpeed,
    detail,
    color,
    variant,
    progress,
    origin,
  });
  paramsRef.current = { formationSpeed, detail, color, variant, progress, origin };

  const onOriginChangeRef = useRef(onOriginChange);
  onOriginChangeRef.current = onOriginChange;
  const onPressChangeRef = useRef(onPressChange);
  onPressChangeRef.current = onPressChange;

  const kickRef = useRef<() => void>(() => {});

  useEffect(() => {
    const node = canvasRef.current;
    const gfx = node?.getContext("2d");
    if (!node || !gfx) return;
    const view: HTMLCanvasElement = node;
    const ctx: CanvasRenderingContext2D = gfx;

    let frame = 0;
    let running = false;
    let disposed = false;
    let lastProgress = Number.NaN;
    let lastW = 0;
    let lastH = 0;
    let samples: Sample[] = [];
    let sampleKey = "";

    function sizeCanvas(): { width: number; height: number } {
      const cssW = view.clientWidth;
      const cssH = view.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const nextW = Math.max(1, Math.round(cssW * dpr));
      const nextH = Math.max(1, Math.round(cssH * dpr));
      if (view.width !== nextW || view.height !== nextH) {
        view.width = nextW;
        view.height = nextH;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { width: cssW, height: cssH };
    }

    function draw(): boolean {
      const { width, height } = sizeCanvas();
      const params = paramsRef.current;
      const key = `${params.variant}:${Math.round(params.detail)}`;
      if (key !== sampleKey) {
        samples = sampleConstruct(params.variant, params.detail);
        sampleKey = key;
      }

      const progressChanged = Number.isNaN(lastProgress)
        ? true
        : Math.abs(params.progress - lastProgress) > SETTLE_EPS;
      const sizeChanged = width !== lastW || height !== lastH;
      lastProgress = params.progress;
      lastW = width;
      lastH = height;

      const cx = width / 2;
      const cy = height / 2;
      const frame = constructFrame(params.variant);
      const scale = (Math.min(width, height) * 0.46) / Math.max(frame.radius, 0.2);
      const originPx = {
        x: params.origin.x * width,
        y: params.origin.y * height,
      };
      const hue = hueFromColor(params.color);
      const count = samples.length;
      const toScreen = (point: Vec2) => project(point, cx, cy, scale, frame.ox, frame.oy);
      const sourceGate = clamp01(params.progress / 0.1) * clamp01((0.88 - params.progress) / 0.16);

      ctx.clearRect(0, 0, width, height);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      if (sourceGate > 0.02) {
        const guides = guideVertices(params.variant);
        ctx.setLineDash([1.8, 5]);
        ctx.lineWidth = 0.85;
        ctx.strokeStyle = hsl(hue, 32, 30, 0.18 * sourceGate);
        for (let g = 0; g < guides.length; g++) {
          const vertex = guides[g];
          if (!vertex) continue;
          const local = localProgress(params.progress, g, guides.length, params.formationSpeed);
          if (local < 0.08 || local > 0.92) continue;
          const pos = mix(originPx, toScreen(vertex), local);
          ctx.beginPath();
          ctx.moveTo(originPx.x, originPx.y);
          ctx.lineTo(pos.x, pos.y);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }

      const bodyReveal = easeOutQuad(clamp01((params.progress - 0.36) / 0.28));
      if (bodyReveal > 0.02) {
        ctx.fillStyle = hsl(hue, 40, 24, 0.92 * bodyReveal);
        for (const ring of fillRings(params.variant)) {
          ctx.beginPath();
          ring.forEach((point, index) => {
            const p = toScreen(point);
            if (index === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          });
          ctx.closePath();
          ctx.fill();
        }
      }

      const facets = detailedFacets(params.variant, params.detail);
      if (facets.length > 0) {
        for (const facet of facets) {
          const midY = (facet.a.y + facet.b.y + facet.c.y) / 3;
          const stagger = clamp01((midY + 1) / 2) * 0.1;
          const reveal = easeOutQuad(clamp01((params.progress - 0.48 - stagger) / 0.2));
          if (reveal < 0.02) continue;
          const light = 14 + facet.shade * 28;
          const sat = 34 + facet.shade * 20;
          ctx.fillStyle = hsl(hue, sat, light, (0.18 + facet.shade * 0.34) * reveal);
          ctx.beginPath();
          const pa = toScreen(facet.a);
          const pb = toScreen(facet.b);
          const pc = toScreen(facet.c);
          ctx.moveTo(pa.x, pa.y);
          ctx.lineTo(pb.x, pb.y);
          ctx.lineTo(pc.x, pc.y);
          ctx.closePath();
          ctx.fill();
        }
      }

      const edges = detailedEdges(params.variant, params.detail);
      const coverage = new Array<number>(edges.length).fill(0);
      const coverageCount = new Array<number>(edges.length).fill(0);

      for (let i = 0; i < count; i++) {
        const sample = samples[i];
        if (!sample) continue;
        const local = localProgress(params.progress, i, count, params.formationSpeed);
        const edgeCoverage = coverage[sample.edgeIndex] ?? 0;
        coverage[sample.edgeIndex] = edgeCoverage + local;
        coverageCount[sample.edgeIndex] = (coverageCount[sample.edgeIndex] ?? 0) + 1;

      }

      for (let e = 0; e < edges.length; e++) {
        const edge = edges[e];
        const n = coverageCount[e] ?? 0;
        if (!edge || n === 0) continue;
        const amount = (coverage[e] ?? 0) / n;
        if (amount < 0.04) continue;
        const from = toScreen(edge.a);
        const to = mix(from, toScreen(edge.b), amount);
        const weight =
          edge.layer === "outline" ? 1.35 : edge.layer === "wire" ? 1.05 : 0.9;
        ctx.strokeStyle = hsl(
          hue,
          edge.layer === "complete" ? 34 : 40,
          edge.layer === "outline" ? 24 : 28,
          0.28 + amount * 0.5,
        );
        ctx.lineWidth = weight;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      }

      return !progressChanged && !sizeChanged;
    }

    function loop() {
      if (disposed) return;
      const settled = draw();
      if (settled) {
        running = false;
        frame = 0;
        return;
      }
      frame = requestAnimationFrame(loop);
    }

    function kick() {
      if (disposed || running) return;
      running = true;
      frame = requestAnimationFrame(loop);
    }

    kickRef.current = kick;
    kick();

    const observer = new ResizeObserver(() => kick());
    observer.observe(view);

    return () => {
      disposed = true;
      running = false;
      kickRef.current = () => {};
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    kickRef.current();
  }, [formationSpeed, detail, color, variant, progress, origin.x, origin.y]);

  function onPointerDown(event: PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    const canvas = event.currentTarget;
    canvas.setPointerCapture(event.pointerId);
    const next = originFromEvent(event, canvas);
    onOriginChangeRef.current?.(next);
    onPressChangeRef.current?.(true, next);
  }

  function onPointerUp(event: PointerEvent<HTMLCanvasElement>) {
    const next = originFromEvent(event, event.currentTarget);
    onPressChangeRef.current?.(false, next);
  }

  const rootClass = className ? `${styles.root} ${className}` : styles.root;

  return (
    <div className={rootClass}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        role="img"
        aria-label="Emerald construct"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
    </div>
  );
}
