export type Layer = "outline" | "wire" | "complete";

export type Vec2 = { x: number; y: number };

export type Edge = {
  a: Vec2;
  b: Vec2;
  layer: Layer;
};

export type ConstructId = "bird" | "stella" | "octagram";

export type Sample = {
  x: number;
  y: number;
  layer: Layer;
  edgeIndex: number;
  order: number;
};

export type Facet = {
  a: Vec2;
  b: Vec2;
  c: Vec2;
  shade: number;
};

export const CONSTRUCTS: readonly { id: ConstructId; label: string }[] = [
  { id: "bird", label: "Bird" },
  { id: "stella", label: "Stella" },
  { id: "octagram", label: "Octagram" },
];

export const DETAIL_MIN = 32;
export const DETAIL_MAX = 176;
const LAYERS: readonly Layer[] = ["outline", "wire", "complete"];

export function nextConstruct(id: ConstructId): ConstructId {
  const index = CONSTRUCTS.findIndex(entry => entry.id === id);
  const next = CONSTRUCTS[(index + 1) % CONSTRUCTS.length];
  return next?.id ?? "bird";
}

export function constructLabel(id: ConstructId): string {
  return CONSTRUCTS.find(entry => entry.id === id)?.label ?? "Bird";
}

export function isConstructId(value: string): value is ConstructId {
  return CONSTRUCTS.some(entry => entry.id === value);
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function detailToCount(detail: number): number {
  const t = clamp01(detail / 100);
  return Math.round(DETAIL_MIN + (DETAIL_MAX - DETAIL_MIN) * t);
}

export function hueFromColor(color: number): number {
  return clamp01(color / 100) * 360;
}

export function regularPolygon(count: number, radius: number, rotation = 0): Vec2[] {
  const points: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    const angle = rotation + (i / count) * Math.PI * 2;
    points.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  }
  return points;
}

/** Rectangle with clipped corners — the emerald-cut octagon. */
export function emeraldOctagon(rx: number, ry: number, clip = 0.32): Vec2[] {
  const cx = rx * clip;
  const cy = ry * clip;
  return [
    { x: -rx + cx, y: -ry },
    { x: rx - cx, y: -ry },
    { x: rx, y: -ry + cy },
    { x: rx, y: ry - cy },
    { x: rx - cx, y: ry },
    { x: -rx + cx, y: ry },
    { x: -rx, y: ry - cy },
    { x: -rx, y: -ry + cy },
  ];
}

function scalePoints(points: Vec2[], factor: number): Vec2[] {
  return points.map(point => ({ x: point.x * factor, y: point.y * factor }));
}

function ring(points: Vec2[], layer: Layer): Edge[] {
  const edges: Edge[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (!a || !b) continue;
    edges.push({ a, b, layer });
  }
  return edges;
}

function spokes(from: Vec2[], to: Vec2[], layer: Layer): Edge[] {
  const count = Math.min(from.length, to.length);
  const edges: Edge[] = [];
  for (let i = 0; i < count; i++) {
    const a = from[i];
    const b = to[i];
    if (!a || !b) continue;
    edges.push({ a, b, layer });
  }
  return edges;
}

function diameters(points: Vec2[], stride: number, layer: Layer): Edge[] {
  const edges: Edge[] = [];
  const used = new Set<number>();
  const count = points.length;
  for (let i = 0; i < count; i++) {
    const j = (i + stride) % count;
    const key = Math.min(i, j) * 100 + Math.max(i, j);
    if (used.has(key) || i === j) continue;
    used.add(key);
    const a = points[i];
    const b = points[j];
    if (!a || !b) continue;
    edges.push({ a, b, layer });
  }
  return edges;
}

function star(points: Vec2[], step: number, layer: Layer): Edge[] {
  const edges: Edge[] = [];
  const count = points.length;
  const used = new Set<number>();
  for (let i = 0; i < count; i++) {
    const j = (i + step) % count;
    const key = Math.min(i, j) * 100 + Math.max(i, j);
    if (used.has(key)) continue;
    used.add(key);
    const a = points[i];
    const b = points[j];
    if (!a || !b) continue;
    edges.push({ a, b, layer });
  }
  return edges;
}

function pairEdges(points: Vec2[], pairs: readonly (readonly [number, number])[], layer: Layer): Edge[] {
  const edges: Edge[] = [];
  for (const [i, j] of pairs) {
    const a = points[i];
    const b = points[j];
    if (!a || !b) continue;
    edges.push({ a, b, layer });
  }
  return edges;
}

function outlineEdges(points: Vec2[], indices: readonly number[], layer: Layer): Edge[] {
  const edges: Edge[] = [];
  for (let i = 0; i < indices.length; i++) {
    const a = points[indices[i] ?? -1];
    const b = points[indices[(i + 1) % indices.length] ?? -1];
    if (!a || !b) continue;
    edges.push({ a, b, layer });
  }
  return edges;
}

/**
 * Low-poly hummingbird in hover: needle beak right, wing raised, tail trailing left.
 * Coordinates are canvas-style (y down). Shade is 0 (shadow) to 1 (lit).
 */
function hummingbird() {
  const v: Vec2[] = [
    { x: 1.62, y: -0.28 },
    { x: 0.78, y: -0.22 },
    { x: 0.80, y: -0.06 },
    { x: 0.52, y: -0.42 },
    { x: 0.28, y: -0.30 },
    { x: 0.54, y: -0.16 },
    { x: 0.58, y: 0.10 },
    { x: 0.28, y: 0.16 },
    { x: -0.02, y: 0.28 },
    { x: -0.36, y: 0.20 },
    { x: 0.18, y: 0.00 },
    { x: 0.16, y: -0.20 },
    { x: -0.02, y: -0.58 },
    { x: -0.18, y: -0.88 },
    { x: -0.22, y: -1.12 },
    { x: -0.52, y: -0.68 },
    { x: -0.26, y: -0.18 },
    { x: -0.48, y: -0.04 },
    { x: -0.88, y: -0.12 },
    { x: -1.42, y: 0.22 },
    { x: -0.98, y: 0.36 },
    { x: -0.58, y: 0.16 },
    { x: 0.50, y: -0.02 },
  ];

  const outline = [0, 1, 3, 4, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 9, 8, 7, 6, 2] as const;

  const wires: readonly (readonly [number, number])[] = [
    [1, 5],
    [5, 2],
    [5, 22],
    [22, 2],
    [22, 6],
    [3, 5],
    [4, 5],
    [5, 11],
    [5, 10],
    [22, 10],
    [10, 7],
    [11, 10],
    [11, 16],
    [10, 16],
    [16, 17],
    [10, 17],
    [10, 9],
    [12, 16],
    [13, 16],
    [13, 15],
    [17, 21],
    [4, 11],
    [6, 7],
  ];

  const tris: readonly (readonly [number, number, number, number])[] = [
    [0, 1, 5, 0.96],
    [0, 5, 22, 0.74],
    [0, 22, 2, 0.46],
    [1, 3, 5, 0.90],
    [3, 4, 5, 0.82],
    [5, 4, 11, 0.70],
    [5, 11, 10, 0.62],
    [5, 22, 10, 0.54],
    [22, 6, 10, 0.38],
    [22, 2, 6, 0.30],
    [6, 7, 10, 0.44],
    [7, 8, 10, 0.50],
    [8, 9, 10, 0.34],
    [11, 12, 16, 0.88],
    [12, 13, 16, 0.78],
    [13, 14, 15, 0.92],
    [13, 15, 16, 0.56],
    [11, 16, 10, 0.48],
    [16, 17, 10, 0.40],
    [17, 9, 10, 0.28],
    [17, 21, 9, 0.22],
    [17, 18, 19, 0.64],
    [17, 19, 20, 0.30],
    [17, 20, 21, 0.20],
    [4, 11, 16, 0.52],
    [4, 11, 12, 0.84],
    [1, 5, 22, 0.80],
    [15, 16, 17, 0.42],
  ];

  const facets: Facet[] = [];
  for (const [i, j, k, shade] of tris) {
    const a = v[i];
    const b = v[j];
    const c = v[k];
    if (!a || !b || !c) continue;
    facets.push({ a, b, c, shade });
  }

  const complete: (readonly [number, number])[] = [
    [4, 12],
    [7, 8],
    [13, 14],
    [14, 15],
    [18, 19],
  ];

  return {
    vertices: v,
    outline,
    edges: [
      ...outlineEdges(v, outline, "outline"),
      ...pairEdges(v, wires, "wire"),
      ...pairEdges(v, complete, "complete"),
    ],
    facets,
  };
}

export function edgesFor(id: ConstructId): Edge[] {
  if (id === "bird") return hummingbird().edges;

  if (id === "stella") {
    const up = regularPolygon(3, 1, -Math.PI / 2);
    const down = regularPolygon(3, 1, Math.PI / 2);
    const hex = regularPolygon(6, 0.5, Math.PI / 6);
    const core = regularPolygon(6, 0.2, Math.PI / 6);
    return [
      ...ring(up, "outline"),
      ...ring(down, "outline"),
      ...ring(hex, "wire"),
      ...spokes(hex, core, "complete"),
      ...ring(core, "complete"),
    ];
  }

  const outer = emeraldOctagon(0.78, 1, 0.34);
  const step = scalePoints(outer, 0.58);
  const core = scalePoints(outer, 0.3);
  return [
    ...ring(outer, "outline"),
    ...ring(step, "wire"),
    ...star(outer, 3, "wire"),
    ...ring(core, "complete"),
    ...diameters(core, 4, "complete"),
  ];
}

function distributedDetail<T>(items: T[], detail: number): T[] {
  const count = Math.round(items.length * clamp01(detail / 100));
  if (count <= 0) return [];
  if (count >= items.length) return items;
  return Array.from({ length: count }, (_, index) => {
    const itemIndex = Math.floor((index * items.length) / count);
    return items[itemIndex];
  }).filter((item): item is T => item != null);
}

export function detailedEdges(id: ConstructId, detail: number): Edge[] {
  const edges = edgesFor(id);
  const outline = edges.filter(edge => edge.layer === "outline");
  const internal = edges.filter(edge => edge.layer !== "outline");
  return [...outline, ...distributedDetail(internal, detail)];
}

export function fillRings(id: ConstructId): Vec2[][] {
  if (id === "bird") {
    const bird = hummingbird();
    return [
      bird.outline
        .map(index => bird.vertices[index])
        .filter((point): point is Vec2 => point != null),
    ];
  }
  if (id === "stella") {
    return [
      regularPolygon(3, 1, -Math.PI / 2),
      regularPolygon(3, 1, Math.PI / 2),
    ];
  }
  return [emeraldOctagon(0.78, 1, 0.34)];
}

export function facetsFor(id: ConstructId): Facet[] {
  if (id === "bird") return hummingbird().facets;
  return [];
}

export function detailedFacets(id: ConstructId, detail: number): Facet[] {
  return distributedDetail(facetsFor(id), detail);
}

export function detailElementCount(id: ConstructId, detail: number): number {
  const internalEdges = detailedEdges(id, detail).filter(
    edge => edge.layer !== "outline",
  ).length;
  return internalEdges + detailedFacets(id, detail).length;
}

export function guideVertices(id: ConstructId): Vec2[] {
  if (id === "bird") {
    const bird = hummingbird();
    return bird.outline
      .map(index => bird.vertices[index])
      .filter((point): point is Vec2 => point != null);
  }
  const seen: Vec2[] = [];
  for (const edge of edgesFor(id)) {
    if (edge.layer !== "outline") continue;
    seen.push(edge.a);
  }
  return seen;
}

export function constructFrame(id: ConstructId): { ox: number; oy: number; radius: number } {
  const points: Vec2[] = [];
  for (const edge of edgesFor(id)) {
    points.push(edge.a, edge.b);
  }
  if (points.length === 0) return { ox: 0, oy: 0, radius: 1 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  return {
    ox: (minX + maxX) / 2,
    oy: (minY + maxY) / 2,
    radius: Math.max(maxX - minX, maxY - minY) * 0.55,
  };
}

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function lerpVec(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function sampleConstruct(id: ConstructId, detail: number): Sample[] {
  const edges = detailedEdges(id, detail);
  const budget = detailToCount(detail);
  const samples: Sample[] = [];
  const lengths = edges.map(edge => dist(edge.a, edge.b));

  for (const layer of LAYERS) {
    const indexes: number[] = [];
    for (let i = 0; i < edges.length; i++) {
      if (edges[i]?.layer === layer) indexes.push(i);
    }
    if (indexes.length === 0) continue;

    let layerLength = 0;
    for (const index of indexes) {
      layerLength += lengths[index] ?? 0;
    }
    if (layerLength <= 0) layerLength = 1;

    const share = Math.max(indexes.length * 2, Math.round(budget / LAYERS.length));
    for (const index of indexes) {
      const edge = edges[index];
      const length = lengths[index] ?? 0;
      if (!edge) continue;
      const count = Math.max(2, Math.round(share * (length / layerLength)));
      for (let i = 0; i < count; i++) {
        const t = count === 1 ? 0.5 : i / (count - 1);
        const point = lerpVec(edge.a, edge.b, t);
        const prev = samples[samples.length - 1];
        if (prev && dist(prev, point) < 1e-6) continue;
        samples.push({
          x: point.x,
          y: point.y,
          layer,
          edgeIndex: index,
          order: samples.length,
        });
      }
    }
  }

  return samples;
}

/**
 * Map global construction progress to a single sample.
 * Higher formation speed shortens travel so later points wait, then catch up quickly.
 * Decreasing progress reverses the same mapping (complete → wire → outline).
 */
export function localProgress(
  globalProgress: number,
  index: number,
  count: number,
  formationSpeed: number,
): number {
  const progress = clamp01(globalProgress);
  if (progress <= 0) return 0;
  if (progress >= 1) return 1;
  if (count <= 1) return progress;
  const travel = 0.22 - clamp01(formationSpeed / 100) * 0.08;
  const launch = (index / (count - 1)) * (1 - travel);
  return clamp01((progress - launch) / travel);
}

export function easeOutQuad(t: number): number {
  const x = clamp01(t);
  return 1 - (1 - x) * (1 - x);
}

export function mix(origin: Vec2, target: Vec2, t: number): Vec2 {
  const e = easeOutQuad(t);
  return lerpVec(origin, target, e);
}
