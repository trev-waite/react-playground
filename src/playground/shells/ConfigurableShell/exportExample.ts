type Point = { x: number; y: number };

const CX = 210;
const CY = 136;
const POINT_COUNT = 6;

export function blobPoints(
  form: number,
  soft: number,
  drift: number,
  time = 0,
  phase = 0,
): Point[] {
  const formN = form / 100;
  const driftN = drift / 100;
  const base = 62 + (soft / 100) * 10;
  const points: Point[] = [];

  for (let i = 0; i < POINT_COUNT; i++) {
    const angle = (i / POINT_COUNT) * Math.PI * 2 - Math.PI / 2;
    const lobe = 0.5 + 0.5 * Math.cos(angle * 3 + phase);
    const pinch = 0.62 + 0.38 * lobe;
    const radius =
      base * (1 - formN * 0.28 + formN * pinch) +
      driftN * 9 * Math.sin(time * 1.15 + angle * 2 + phase);
    points.push({
      x: CX + Math.cos(angle) * radius,
      y: CY + Math.sin(angle) * radius * 0.94,
    });
  }

  return points;
}

function pointAt(points: Point[], index: number): Point {
  const point = points[index];
  if (!point) throw new Error("blob path is empty");
  return point;
}

/** Closed cubic through polar points. `soft` pulls handles toward a circle. */
export function blobPath(form: number, soft: number, drift: number, time = 0, phase = 0): string {
  const pts = blobPoints(form, soft, drift, time, phase);
  const k = 0.14 + (soft / 100) * 0.22;
  const n = pts.length;
  const start = pointAt(pts, 0);
  let d = `M ${fmt(start.x)} ${fmt(start.y)}`;

  for (let i = 0; i < n; i++) {
    const p0 = pointAt(pts, (i - 1 + n) % n);
    const p1 = pointAt(pts, i);
    const p2 = pointAt(pts, (i + 1) % n);
    const p3 = pointAt(pts, (i + 2) % n);
    const c1x = p1.x + (p2.x - p0.x) * k;
    const c1y = p1.y + (p2.y - p0.y) * k;
    const c2x = p2.x - (p3.x - p1.x) * k;
    const c2y = p2.y - (p3.y - p1.y) * k;
    d += ` C ${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(p2.x)} ${fmt(p2.y)}`;
  }

  return `${d} Z`;
}

export function exampleMetrics(
  form: number,
  soft: number,
  drift: number,
  offset: { x: number; y: number } = { x: 0, y: 0 },
) {
  return {
    path: blobPath(form, soft, drift, 0, 0),
    ghost: blobPath(form, soft, drift, 0.6, 0.35),
    panX: offset.x * 0.35,
    panY: offset.y * 0.35,
  };
}

function fmt(value: number, digits = 2): string {
  return String(Number(value.toFixed(digits)));
}

/** Demo-only: React source for the current example preview. Swap with your own exporter. */
export function exportExampleCode(
  form: number,
  soft: number,
  drift: number,
  offset: { x: number; y: number } = { x: 0, y: 0 },
): string {
  const m = exampleMetrics(form, soft, drift, offset);
  const open =
    m.panX === 0 && m.panY === 0
      ? ""
      : `\n      <g transform="translate(${fmt(m.panX)} ${fmt(m.panY)})">`;
  const close = m.panX === 0 && m.panY === 0 ? "" : "\n      </g>";
  const pad = m.panX === 0 && m.panY === 0 ? "      " : "        ";

  return `export function Example() {
  return (
    <svg
      viewBox="0 0 420 280"
      role="img"
      aria-label="Morphing mark"
      style={{ display: "block", width: "100%", height: "auto" }}
    >${open}
${pad}<path
${pad}  d="${m.ghost}"
${pad}  fill="none"
${pad}  stroke="#111113"
${pad}  strokeWidth={1.4}
${pad}  opacity={0.2}
${pad}/>
${pad}<path
${pad}  d="${m.path}"
${pad}  fill="#111113"
${pad}/>${close}
    </svg>
  );
}
`;
}
