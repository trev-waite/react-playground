import {
  type ConstructId,
  edgesFor,
  facetsFor,
  fillRings,
  hueFromColor,
  sampleConstruct,
} from "./constructs";

/**
 * Portable source for Save / Make Live.
 * Geometry is baked at the current Experimental values. The published file is
 * the component only — no shell, sliders, or workbench chrome.
 */
export function exportEmeraldConstructCode(
  formationSpeed: number,
  detail: number,
  color: number,
  variant: ConstructId,
  _progress: number,
): string {
  const samples = sampleConstruct(variant, detail);
  const edges = edgesFor(variant);
  const rings = fillRings(variant);
  const facets = facetsFor(variant);
  const hue = Math.round(hueFromColor(color));

  return `import { useEffect, useRef } from "react";

const SAMPLES = ${JSON.stringify(samples)};
const EDGES = ${JSON.stringify(edges)};
const RINGS = ${JSON.stringify(rings)};
const FACETS = ${JSON.stringify(facets)};
const SPEED = ${formationSpeed};
const HUE = ${hue};

export function Example({ progress = 1 }: { progress?: number } = {}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = width / 2;
    const cy = height / 2;
    const scale = Math.min(width, height) * 0.36;
    const origin = { x: width * 0.5, y: height * 0.68 };
    const count = Math.max(SAMPLES.length, 1);
    const travel = 0.4 - Math.min(1, Math.max(0, SPEED / 100)) * 0.26;
    const amount = Math.min(1, Math.max(0, progress));
    const project = (point) => ({ x: cx + point.x * scale, y: cy + point.y * scale });
    const localOf = (index) => {
      if (amount <= 0) return 0;
      if (amount >= 1) return 1;
      const launch = (index / Math.max(count - 1, 1)) * (1 - travel);
      return Math.min(1, Math.max(0, (amount - launch) / travel));
    };
    const ease = (t) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
    const mix = (a, b, t) => {
      const e = ease(t);
      return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e };
    };
    const hsl = (sat, light, alpha = 1) =>
      alpha >= 1
        ? \`hsl(\${HUE} \${sat}% \${light}%)\`
        : \`hsl(\${HUE} \${sat}% \${light}% / \${alpha})\`;

    ctx.clearRect(0, 0, width, height);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    const fillAlpha = ease(Math.max(0, (amount - 0.82) / 0.18)) * 0.1;
    if (FACETS.length) {
      FACETS.forEach((facet) => {
        const reveal = ease(Math.max(0, (amount - 0.68) / 0.24));
        if (reveal < 0.02) return;
        const light = 16 + facet.shade * 22;
        ctx.fillStyle = hsl(30 + facet.shade * 16, light, 0.42 + reveal * 0.5);
        ctx.beginPath();
        const pa = project(facet.a);
        const pb = project(facet.b);
        const pc = project(facet.c);
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.lineTo(pc.x, pc.y);
        ctx.closePath();
        ctx.fill();
      });
    } else if (fillAlpha > 0.002) {
      ctx.fillStyle = hsl(28, 26, fillAlpha);
      for (const ring of RINGS) {
        ctx.beginPath();
        ring.forEach((point, index) => {
          const p = project(point);
          if (index === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        ctx.fill();
      }
    }

    const coverage = EDGES.map(() => 0);
    const coverageCount = EDGES.map(() => 0);
    SAMPLES.forEach((sample, index) => {
      const local = localOf(index);
      coverage[sample.edgeIndex] += local;
      coverageCount[sample.edgeIndex] += 1;
    });

    EDGES.forEach((edge, index) => {
      const n = coverageCount[index];
      if (!n) return;
      const cover = coverage[index] / n;
      if (cover < 0.04) return;
      const from = project(edge.a);
      const to = mix(from, project(edge.b), cover);
      ctx.strokeStyle = hsl(edge.layer === "outline" ? 40 : 34, 26, 0.28 + cover * 0.5);
      ctx.lineWidth = edge.layer === "outline" ? 1.35 : 1;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    });

    SAMPLES.forEach((sample, index) => {
      const local = localOf(index);
      if (local <= 0.02) return;
      const pos = mix(origin, project(sample), local);
      ctx.fillStyle = hsl(44, 30, 0.55 + local * 0.4);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    });

    if (amount > 0.04 && amount < 0.88) {
      ctx.fillStyle = hsl(48, 36, 0.92);
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, 4.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [progress]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Emerald construct"
      style={{ display: "block", width: "100%", height: "100%" }}
    />
  );
}
`;
}
