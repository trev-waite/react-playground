import { useEffect, useRef } from "react";

const SLIDERS = {"bounce":71,"wobble":0,"tempo":58};

type Point = { x: number; y: number };
type Contour = Point[];
type Lab = [number, number, number];
type EyeKind = "open" | "wide" | "happy" | "sleepy";
type MouthKind = "smile" | "grin" | "o" | "small";
type Idle = "breathe" | "hop" | "tremble" | "snooze" | "wave" | "beat" | "twinkle";
type Shape =
  | { kind: "body"; width: number; height: number; flat: number; eyes: EyeKind; mouth: MouthKind }
  | { kind: "text"; text: string }
  | { kind: "heart" }
  | { kind: "star" };
type Target = Shape & { color: string; idle: Idle };
type BodyTarget = Extract<Target, { kind: "body" }>;
/** A spliced-in piece (letter, dot, or hole) spans outline indices start..end; start - 1 and end + 1 anchor it. */
type Bridge = { start: number; end: number };
type Pieces = { bridges: Bridge[]; offset: number };
type Form = {
  body: Contour;
  bridges: Bridge[];
  features: Contour[];
  pupil: number;
  pupilTravel: number;
  blinks: boolean;
  center: Point;
  color: Lab;
  idle: Idle;
};
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gx: number;
  gy: number;
  nx: number;
  ny: number;
  switchAt: number;
};
type Spring = { value: number; velocity: number };
type Edge = "T" | "R" | "B" | "L";

const TAU = Math.PI * 2;
// Every form is one closed outline with this many points, so any form can become any other.
const COUNT = 800;
const FEATURE_COUNT = 40;
const GROUND = 84;
const VIEW_BOX = "-230 -150 460 290";
const BODY_HALF_WIDTH = 92;
const BODY_HEIGHT = 150;
const TEXT_BOX = { width: 380, height: 150 };
const TEXT_FONT =
  '900 200px "Arial Rounded MT Bold", "SF Pro Rounded", ui-rounded, "Nunito", system-ui, sans-serif';
const STIFFNESS = 190;
const FACE_STIFFNESS = 300;
const COLOR_OMEGA = 6.5;
const BLINK_SECONDS = 0.18;
const FACE_COLOR = "#FFFFFF";
const PUPIL_COLOR = "#111113";
const SHADOW_COLOR = "#111113";
// A bridge is filled while it reads as a seam between touching pieces (short across, long along)
// and left open once it would read as a thread (long across, short along). Ratios are across / along.
const SEAM = { touching: 2, filled: 0.7, open: 1.4 };
const NO_PIECES: Pieces = { bridges: [], offset: 0 };

const REST: BodyTarget = {
  kind: "body",
  width: 1,
  height: 1,
  flat: 4,
  eyes: "open",
  mouth: "smile",
  color: "#111113",
  idle: "breathe",
};

const PLAYLIST: Target[] = [
  REST,
  { kind: "body", width: 1.14, height: 0.84, flat: 4, eyes: "happy", mouth: "grin", color: "#FF8A1F", idle: "hop" },
  { kind: "text", text: "hi", color: "#2F6BFF", idle: "wave" },
  { kind: "heart", color: "#FF3D6E", idle: "beat" },
  REST,
  { kind: "body", width: 0.86, height: 1.18, flat: 3, eyes: "wide", mouth: "o", color: "#00A99D", idle: "tremble" },
  { kind: "text", text: "wow", color: "#8B5CF6", idle: "wave" },
  { kind: "star", color: "#FFB800", idle: "twinkle" },
  { kind: "body", width: 1.32, height: 0.6, flat: 6, eyes: "sleepy", mouth: "small", color: "#4F5BD5", idle: "snooze" },
  { kind: "text", text: "zzz", color: "#4F5BD5", idle: "wave" },
];

const MARCHING_SEGMENTS: Partial<Record<number, [Edge, Edge][]>> = {
  1: [["L", "B"]],
  2: [["B", "R"]],
  3: [["L", "R"]],
  4: [["R", "T"]],
  6: [["B", "T"]],
  7: [["L", "T"]],
  8: [["T", "L"]],
  9: [["T", "B"]],
  11: [["T", "R"]],
  12: [["R", "L"]],
  13: [["R", "B"]],
  14: [["B", "L"]],
};
const MARCHING_SADDLES: Partial<Record<number, { joined: [Edge, Edge][]; split: [Edge, Edge][] }>> = {
  5: { joined: [["L", "T"], ["R", "B"]], split: [["L", "B"], ["R", "T"]] },
  10: { joined: [["T", "R"], ["B", "L"]], split: [["T", "L"], ["B", "R"]] },
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const fract = (value: number) => value - Math.floor(value);

function pointAt(list: Contour, index: number): Point {
  const point = list[((index % list.length) + list.length) % list.length];
  if (!point) throw new Error("Empty contour");
  return point;
}

function signedArea(points: Contour) {
  return (
    points.reduce((sum, p, i) => {
      const q = pointAt(points, i + 1);
      return sum + p.x * q.y - q.x * p.y;
    }, 0) / 2
  );
}

function perimeter(points: Contour) {
  return points.reduce((sum, p, i) => {
    const q = pointAt(points, i + 1);
    return sum + Math.hypot(q.x - p.x, q.y - p.y);
  }, 0);
}

function boundsOf(points: Contour) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, maxX, minY, maxY };
}

function centroid(points: { x: number; y: number }[]): Point {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

const orient = (points: Contour) => (signedArea(points) < 0 ? [...points].reverse() : points);
const translate = (points: Contour, dx: number, dy: number) =>
  points.map(p => ({ x: p.x + dx, y: p.y + dy }));

/** Evenly spaced points along a closed polyline. */
function resample(points: Contour, count: number): Contour {
  const lengths = [0];
  let total = 0;
  points.forEach((p, i) => {
    const q = pointAt(points, i + 1);
    total += Math.hypot(q.x - p.x, q.y - p.y);
    lengths.push(total);
  });
  const out: Contour = [];
  let segment = 0;
  for (let k = 0; k < count; k++) {
    const distance = (k / count) * total;
    while (segment < points.length - 1 && (lengths[segment + 1] ?? total) < distance) segment++;
    const start = lengths[segment] ?? 0;
    const span = (lengths[segment + 1] ?? total) - start;
    const t = span > 0 ? (distance - start) / span : 0;
    const a = pointAt(points, segment);
    const b = pointAt(points, segment + 1);
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

/** Scale into a box, centered on x = 0 and resting on `bottom`. */
function fit(contours: Contour[], maxWidth: number, maxHeight: number, bottom = GROUND): Contour[] {
  const b = boundsOf(contours.flat());
  const scale = Math.min(maxWidth / (b.maxX - b.minX), maxHeight / (b.maxY - b.minY));
  const cx = (b.minX + b.maxX) / 2;
  return contours.map(points =>
    points.map(p => ({ x: (p.x - cx) * scale, y: bottom - (b.maxY - p.y) * scale })),
  );
}

function marchingSquares(
  value: (x: number, y: number) => number,
  width: number,
  height: number,
): Contour[] {
  const level = 0.5;
  const links = new Map<number, { to: number; point: Point }>();
  const horizontal = (x: number, y: number) => (y * width + x) * 2;
  const vertical = (x: number, y: number) => (y * width + x) * 2 + 1;
  const crossing = (a: number, b: number) => (a === b ? 0.5 : (level - a) / (b - a));

  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const tl = value(x, y);
      const tr = value(x + 1, y);
      const br = value(x + 1, y + 1);
      const bl = value(x, y + 1);
      const code =
        (tl > level ? 8 : 0) | (tr > level ? 4 : 0) | (br > level ? 2 : 0) | (bl > level ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const edges: Record<Edge, { key: number; point: Point }> = {
        T: { key: horizontal(x, y), point: { x: x + crossing(tl, tr), y } },
        B: { key: horizontal(x, y + 1), point: { x: x + crossing(bl, br), y: y + 1 } },
        L: { key: vertical(x, y), point: { x, y: y + crossing(tl, bl) } },
        R: { key: vertical(x + 1, y), point: { x: x + 1, y: y + crossing(tr, br) } },
      };
      const saddle = MARCHING_SADDLES[code];
      const segments = saddle
        ? (tl + tr + br + bl) / 4 > level
          ? saddle.joined
          : saddle.split
        : (MARCHING_SEGMENTS[code] ?? []);
      for (const [from, to] of segments) {
        links.set(edges[from].key, { to: edges[to].key, point: edges[from].point });
      }
    }
  }

  const contours: Contour[] = [];
  for (const [startKey] of links) {
    if (!links.has(startKey)) continue;
    const contour: Contour = [];
    let key = startKey;
    for (let link = links.get(key); link; link = links.get(key)) {
      links.delete(key);
      contour.push(link.point);
      key = link.to;
    }
    if (contour.length > 6) contours.push(contour);
  }
  return contours;
}

function traceText(text: string): Contour[] {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return [];
  const pad = 32;
  context.font = TEXT_FONT;
  canvas.width = Math.ceil(context.measureText(text).width) + pad * 2;
  canvas.height = 300;
  context.font = TEXT_FONT;
  context.fillText(text, pad, 220);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  const alpha = (x: number, y: number) => (data[(y * canvas.width + x) * 4 + 3] ?? 0) / 255;
  return marchingSquares(alpha, canvas.width, canvas.height).filter(
    contour => Math.abs(signedArea(contour)) > 40,
  );
}

/**
 * Joins letters and holes into one outline so a word is still a single body
 * that can flow back into the pet. `bridges` mark each spliced piece so
 * rendering can let it pinch off cleanly instead of trailing a thread.
 */
function mergeContours(contours: Contour[], count: number): { points: Contour; bridges: Bridge[] } {
  const sorted = [...contours].sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
  if (sorted[0] && signedArea(sorted[0]) < 0) sorted.forEach(contour => contour.reverse());
  const budget = count - 2 * (sorted.length - 1);
  const perimeters = sorted.map(perimeter);
  const total = perimeters.reduce((sum, value) => sum + value, 0);
  const shares = perimeters.map(value => Math.max(12, Math.floor((budget * value) / total)));
  shares[0] = (shares[0] ?? 0) + budget - shares.reduce((sum, value) => sum + value, 0);
  const [first = [], ...rest] = sorted.map((contour, i) => resample(contour, shares[i] ?? 12));

  let merged = first;
  const anchors: Point[] = [];
  while (rest.length) {
    let best = { contour: 0, a: 0, b: 0, distance: Infinity };
    rest.forEach((contour, index) => {
      merged.forEach((p, a) => {
        contour.forEach((q, b) => {
          const distance = (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
          if (distance < best.distance) best = { contour: index, a, b, distance };
        });
      });
    });
    const [other = []] = rest.splice(best.contour, 1);
    anchors.push(pointAt(other, best.b));
    merged = [
      ...merged.slice(0, best.a + 1),
      ...other.slice(best.b),
      ...other.slice(0, best.b + 1),
      ...merged.slice(best.a),
    ];
  }
  // Splicing repeats each anchor point object, so its first and last occurrence bound the piece.
  const bridges = anchors.map(anchor => ({
    start: merged.indexOf(anchor),
    end: merged.lastIndexOf(anchor),
  }));
  return { points: merged, bridges };
}

function mochi(halfWidth: number, halfHeight: number, flat: number): Contour {
  const cy = GROUND - halfHeight;
  const raw = Array.from({ length: 720 }, (_, i) => {
    const angle = Math.PI + (i / 720) * TAU;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const exponent = 2 / (2.1 + (flat - 2.1) * Math.max(0, s));
    return {
      x: halfWidth * (1 + 0.07 * s) * Math.sign(c) * Math.abs(c) ** exponent,
      y: cy + halfHeight * Math.sign(s) * Math.abs(s) ** exponent,
    };
  });
  return orient(resample(raw, COUNT));
}

function heart(): Contour {
  const raw = Array.from({ length: 720 }, (_, i) => {
    const t = (i / 720) * TAU;
    return {
      x: 16 * Math.sin(t) ** 3,
      y: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)),
    };
  });
  return orient(fit([resample(raw, COUNT)], 200, 178)[0] ?? []);
}

function star(): Contour {
  const raw = Array.from({ length: 1000 }, (_, i) => {
    const angle = -Math.PI / 2 + (i / 1000) * TAU;
    const r = 0.5 + 0.5 * ((1 + Math.cos(5 * (angle + Math.PI / 2))) / 2) ** 2.2;
    return { x: r * Math.cos(angle), y: r * Math.sin(angle) };
  });
  return orient(fit([resample(raw, COUNT)], 210, 196, GROUND - 6)[0] ?? []);
}

function ellipse(rx: number, ry: number): Contour {
  const raw = Array.from({ length: 120 }, (_, i) => {
    const angle = Math.PI + (i / 120) * TAU;
    return { x: rx * Math.cos(angle), y: ry * Math.sin(angle) };
  });
  return orient(resample(raw, FEATURE_COUNT));
}

/** A thick arc with round caps: happy eyes, sleepy lids, smiles. */
function arcBand(radius: number, from: number, to: number, thickness: number, dy: number): Contour {
  const half = thickness / 2;
  const polar = (angle: number, r: number, center: Point = { x: 0, y: dy }) => ({
    x: center.x + Math.cos(angle) * r,
    y: center.y + Math.sin(angle) * r,
  });
  const raw: Contour = [];
  for (let i = 0; i <= 40; i++) raw.push(polar(from + ((to - from) * i) / 40, radius + half));
  const end = polar(to, radius);
  for (let i = 1; i < 12; i++) raw.push(polar(to + (Math.PI * i) / 12, half, end));
  for (let i = 0; i <= 40; i++) raw.push(polar(to - ((to - from) * i) / 40, radius - half));
  const start = polar(from, radius);
  for (let i = 1; i < 12; i++) raw.push(polar(from + Math.PI + (Math.PI * i) / 12, half, start));
  return orient(resample(raw, FEATURE_COUNT));
}

function halfDisc(radius: number, dy: number): Contour {
  const raw: Contour = [];
  for (let i = 0; i < 16; i++) raw.push({ x: -radius + (2 * radius * i) / 16, y: dy });
  for (let i = 0; i <= 40; i++) {
    const angle = (Math.PI * i) / 40;
    raw.push({ x: Math.cos(angle) * radius, y: dy + Math.sin(angle) * radius });
  }
  return orient(resample(raw, FEATURE_COUNT));
}

function eyeShape(kind: EyeKind): Contour {
  switch (kind) {
    case "open":
      return ellipse(10, 13.5);
    case "wide":
      return ellipse(14, 15.5);
    case "happy":
      return arcBand(10, Math.PI * 1.12, Math.PI * 1.88, 5.5, 5);
    case "sleepy":
      return arcBand(10, Math.PI * 0.14, Math.PI * 0.86, 4.5, -5);
  }
}

function mouthShape(kind: MouthKind): Contour {
  switch (kind) {
    case "smile":
      return arcBand(12, Math.PI * 0.2, Math.PI * 0.8, 5, -8);
    case "grin":
      return halfDisc(17, -6);
    case "o":
      return ellipse(8, 10.5);
    case "small":
      return arcBand(7, Math.PI * 0.25, Math.PI * 0.75, 4, -4);
  }
}

function hexToOklab(hex: string): Lab {
  const value = Number.parseInt(hex.slice(1), 16);
  const linear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const r = linear((value >> 16) & 255);
  const g = linear((value >> 8) & 255);
  const b = linear(value & 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function bodyForm(target: BodyTarget): Form {
  const halfWidth = BODY_HALF_WIDTH * target.width;
  const halfHeight = (BODY_HEIGHT * target.height) / 2;
  const cy = GROUND - halfHeight;
  const eyeX = halfWidth * 0.36;
  const eyeY = cy - halfHeight * 0.16;
  const eye = eyeShape(target.eyes);
  const eyeRadius = target.eyes === "wide" ? 14 : 10;
  const pupil = target.eyes === "open" ? 5.5 : target.eyes === "wide" ? 7 : 0;
  return {
    body: mochi(halfWidth, halfHeight, target.flat),
    bridges: [],
    features: [
      translate(eye, -eyeX, eyeY),
      translate(eye, eyeX, eyeY),
      translate(mouthShape(target.mouth), 0, cy + halfHeight * 0.32),
    ],
    pupil,
    pupilTravel: Math.max(0, eyeRadius - pupil - 1.5),
    blinks: pupil > 0,
    center: { x: 0, y: cy },
    color: hexToOklab(target.color),
    idle: target.idle,
  };
}

function outlineOf(target: Exclude<Target, BodyTarget>): { points: Contour; bridges: Bridge[] } {
  if (target.kind === "heart") return { points: heart(), bridges: [] };
  if (target.kind === "star") return { points: star(), bridges: [] };
  const letters = traceText(target.text);
  return letters.length
    ? mergeContours(fit(letters, TEXT_BOX.width, TEXT_BOX.height), COUNT)
    : { points: REST_FORM.body, bridges: [] };
}

function buildForm(target: Target): Form {
  if (target.kind === "body") return bodyForm(target);
  const { points: body, bridges } = outlineOf(target);
  const b = boundsOf(body);
  const center = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  const hidden = Array.from({ length: FEATURE_COUNT }, () => ({ ...center }));
  return {
    body,
    bridges,
    features: [hidden, hidden, hidden],
    pupil: 0,
    pupilTravel: 0,
    blinks: false,
    center,
    color: hexToOklab(target.color),
    idle: target.idle,
  };
}

const REST_FORM = bodyForm(REST);

function jiggle(p: Point, center: Point, time: number, amount: number): Point {
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  const angle = Math.atan2(dy, dx);
  const push =
    amount * (1.4 * Math.sin(3 * angle + time * 1.9) + 0.9 * Math.sin(5 * angle - time * 2.6));
  const length = Math.hypot(dx, dy) || 1;
  return { x: p.x + (dx / length) * push, y: p.y + (dy / length) * push };
}

/** Idle motion is a function of position only, so duplicated bridge points never drift apart. */
function idleAt(x: number, y: number, form: Form, time: number, amount: number): Point {
  if (amount === 0) return { x, y };
  const { center } = form;
  switch (form.idle) {
    case "breathe": {
      const s = Math.sin(time * 2.4) * amount;
      return jiggle(
        { x: center.x + (x - center.x) * (1 - 0.015 * s), y: GROUND - (GROUND - y) * (1 + 0.03 * s) },
        center,
        time,
        amount,
      );
    }
    case "hop": {
      const u = fract(time / 0.78);
      return jiggle({ x, y: y - 30 * amount * 4 * u * (1 - u) }, center, time, amount);
    }
    case "tremble": {
      const height = clamp((GROUND - y) / BODY_HEIGHT, 0, 1.4);
      return { x: x + Math.sin(time * 34) * 1.8 * amount * height, y };
    }
    case "snooze": {
      const s = Math.sin(time * 1.4) * amount;
      return { x: center.x + (x - center.x) * (1 - 0.03 * s), y: GROUND - (GROUND - y) * (1 + 0.07 * s) };
    }
    case "wave":
      return { x, y: y - 8 * amount * Math.max(0, Math.sin(time * 3.6 - x * 0.024)) };
    case "beat": {
      const u = fract(time / 1.05);
      const pulse = Math.exp(-(((u - 0.1) / 0.06) ** 2)) + 0.65 * Math.exp(-(((u - 0.3) / 0.07) ** 2));
      const scale = 1 + 0.07 * amount * pulse;
      return { x: center.x + (x - center.x) * scale, y: center.y + (y - center.y) * scale };
    }
    case "twinkle": {
      const angle = Math.sin(time * 2.2) * 0.12 * amount;
      const scale = 1 + 0.035 * amount * Math.sin(time * 4.4);
      const dx = x - center.x;
      const dy = y - center.y;
      return {
        x: center.x + (dx * Math.cos(angle) - dy * Math.sin(angle)) * scale,
        y: center.y + (dx * Math.sin(angle) + dy * Math.cos(angle)) * scale,
      };
    }
  }
}

const particle = (p: Point): Particle => ({
  x: p.x,
  y: p.y,
  vx: 0,
  vy: 0,
  gx: p.x,
  gy: p.y,
  nx: p.x,
  ny: p.y,
  switchAt: 0,
});

/** Rotates the target's point order to best match where the outline is now, so it never twists. */
function alignOffset(particles: Particle[], shape: Contour): number {
  const n = shape.length;
  const cost = (offset: number, stride: number, limit: number) => {
    let total = 0;
    for (let i = 0; i < n && total < limit; i += stride) {
      const p = particles[i];
      if (!p) break;
      const q = pointAt(shape, i + offset);
      total += (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
    }
    return total;
  };
  let coarse = 0;
  let coarseCost = Infinity;
  for (let offset = 0; offset < n; offset += 2) {
    const value = cost(offset, 4, coarseCost);
    if (value < coarseCost) {
      coarseCost = value;
      coarse = offset;
    }
  }
  let best = coarse;
  let bestCost = Infinity;
  for (let offset = coarse - 2; offset <= coarse + 2; offset++) {
    const value = cost(offset, 1, bestCost);
    if (value < bestCost) {
      bestCost = value;
      best = offset;
    }
  }
  return ((best % n) + n) % n;
}

/** Returns the alignment offset: particle i heads to shape index i + offset. */
function retarget(particles: Particle[], shape: Contour, now: number, stagger: number): number {
  const offset = alignOffset(particles, shape);
  const b = boundsOf(shape);
  const span = Math.max(1, b.maxX - b.minX);
  particles.forEach((p, i) => {
    const goal = pointAt(shape, i + offset);
    p.nx = goal.x;
    p.ny = goal.y;
    p.switchAt = now + (stagger * (goal.x - b.minX)) / span;
  });
  return offset;
}

function stepParticle(p: Particle, goal: Point, stiffness: number, damping: number, dt: number) {
  p.vx += ((goal.x - p.x) * stiffness - p.vx * damping) * dt;
  p.vy += ((goal.y - p.y) * stiffness - p.vy * damping) * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
}

function stepSpring(spring: Spring, target: number, stiffness: number, damping: number, dt: number) {
  spring.velocity += ((target - spring.value) * stiffness - spring.velocity * damping) * dt;
  spring.value += spring.velocity * dt;
}

function pathOf(points: Point[]): string {
  let d = "";
  points.forEach((p, i) => {
    d += `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  });
  return `${d}Z`;
}

const lerpPoint = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

const pieceAt = (points: Point[], pieces: Pieces) => (index: number) =>
  pointAt(points, index - pieces.offset);

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** How attached a piece still is at each end of its bridge: 1 touching, 0 pinched off. */
function attachment(bridge: Bridge, at: (index: number) => Point): [number, number] {
  const head = at(bridge.start - 1);
  const start = at(bridge.start);
  const end = at(bridge.end);
  const tail = at(bridge.end + 1);
  const along = Math.max(1e-6, (distance(head, tail) + distance(start, end)) / 2);
  const weight = (across: number) =>
    across < SEAM.touching
      ? 1
      : clamp((SEAM.open - across / along) / (SEAM.open - SEAM.filled), 0, 1);
  return [weight(distance(head, start)), weight(distance(tail, end))];
}

const piecesJoined = (points: Point[], pieces: Pieces) =>
  pieces.bridges.every(bridge =>
    attachment(bridge, pieceAt(points, pieces)).every(weight => weight === 1),
  );

/**
 * Draws each spliced piece as its own subpath. The bridge is only filled while
 * its ends touch, so pieces pinch off without a thread and rejoin without a seam.
 */
function bodyPath(points: Point[], pieces: Pieces): string {
  if (!pieces.bridges.length) return pathOf(points);
  const at = pieceAt(points, pieces);
  const opens = new Set(pieces.bridges.map(bridge => bridge.start));
  const closes = new Map(pieces.bridges.map(bridge => [bridge.end, bridge]));
  const subpaths: Point[][] = [];
  const parents: Point[][] = [];
  let current: Point[] = [];
  for (let index = 0; index < points.length; index++) {
    if (opens.has(index)) {
      parents.push(current);
      current = [];
    }
    current.push(at(index));
    const bridge = closes.get(index);
    if (!bridge) continue;
    subpaths.push(current);
    current = parents.pop() ?? [];
    const [head, tail] = attachment(bridge, at);
    current.push(
      lerpPoint(at(bridge.start - 1), at(bridge.start), head),
      lerpPoint(at(bridge.end + 1), at(bridge.end), tail),
    );
  }
  subpaths.push(current);
  return subpaths.map(pathOf).join("");
}

function toViewBox(svg: SVGSVGElement | null, clientX: number, clientY: number): Point | null {
  const matrix = svg?.getScreenCTM();
  if (!matrix) return null;
  const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
  return { x: point.x, y: point.y };
}

export function Example({
  sliders = SLIDERS,
  progress = 1,
}: {
  sliders?: Record<string, number>;
  progress?: number;
} = {}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const bodyRef = useRef<SVGPathElement>(null);
  const shadowRef = useRef<SVGEllipseElement>(null);
  const featureRefs = useRef<(SVGPathElement | null)[]>([]);
  const pupilRefs = useRef<(SVGEllipseElement | null)[]>([]);
  const lookRef = useRef<Point | null>(null);
  const pokeRef = useRef(0);
  const settings = useRef({ bounce: 0, wobble: 0, tempo: 0, playing: true });
  settings.current = {
    bounce: clamp((sliders.bounce ?? SLIDERS.bounce) / 100, 0, 1),
    wobble: clamp((sliders.wobble ?? SLIDERS.wobble) / 100, 0, 1),
    tempo: clamp((sliders.tempo ?? SLIDERS.tempo) / 100, 0, 1),
    playing: progress >= 0.5,
  };

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const forms = PLAYLIST.map(target => (target === REST ? REST_FORM : buildForm(target)));
    const body = REST_FORM.body.map(particle);
    const features = REST_FORM.features.map(contour => contour.map(particle));
    const look = { x: { value: 0, velocity: 0 }, y: { value: 0, velocity: 0 } };
    const pupilSize: Spring = { value: REST_FORM.pupil, velocity: 0 };
    const squash: Spring = { value: 0, velocity: 0 };
    const color: Spring[] = REST_FORM.color.map(value => ({ value, velocity: 0 }));
    let index = 0;
    let form = REST_FORM;
    // Kept after leaving a word until its pieces have rejoined, so letters flow back without threads.
    let pieces = NO_PIECES;
    // Sequencing, idle motion, and physics share one clamped clock so a slow tab slows everything together.
    let now = 0;
    let formedAt = 0;
    let blinkAt = 2;
    let poke = pokeRef.current;
    let last = performance.now();
    let raf = 0;

    const morphTo = (next: number) => {
      index = next;
      form = forms[next] ?? REST_FORM;
      formedAt = now;
      const { bounce, tempo } = settings.current;
      const offset = retarget(body, form.body, now, reduce ? 0 : 0.34 - 0.2 * tempo);
      if (form.bridges.length) pieces = { bridges: form.bridges, offset };
      form.features.forEach((shape, i) => {
        const particles = features[i];
        if (particles) retarget(particles, shape, now, 0);
      });
      if (!reduce) squash.velocity += 1 + 2.4 * bounce;
    };

    const tick = (ms: number) => {
      const dt = Math.min(1 / 30, (ms - last) / 1000);
      last = ms;
      now += dt;
      const { bounce, wobble, tempo, playing } = settings.current;

      if (pokeRef.current !== poke) {
        poke = pokeRef.current;
        if (playing) morphTo((index + 1) % forms.length);
        else if (!reduce) {
          squash.velocity += 1.5 + 2 * bounce;
          blinkAt = now;
        }
      }
      if (!playing && index !== 0) morphTo(0);
      else if (playing && now - formedAt > 2.8 - 1.8 * tempo) {
        morphTo((index + 1) % forms.length);
      }

      const zeta = reduce ? 1 : 0.95 - 0.65 * bounce;
      const bodyDamping = 2 * zeta * Math.sqrt(STIFFNESS);
      const faceDamping = 2 * zeta * Math.sqrt(FACE_STIFFNESS);
      const squashDamping = 2 * (0.55 - 0.3 * bounce) * Math.sqrt(260);
      const amount = reduce ? 0 : wobble * 2;
      const h = dt / 2;
      const settle = (p: Particle, stiffness: number, damping: number) => {
        if (now >= p.switchAt) {
          p.gx = p.nx;
          p.gy = p.ny;
        }
        const goal = idleAt(p.gx, p.gy, form, now, amount);
        stepParticle(p, goal, stiffness, damping, h);
        stepParticle(p, goal, stiffness, damping, h);
      };
      for (const p of body) settle(p, STIFFNESS, bodyDamping);
      for (const particles of features) {
        for (const p of particles) settle(p, FACE_STIFFNESS, faceDamping);
      }
      stepSpring(squash, 0, 260, squashDamping, h);
      stepSpring(squash, 0, 260, squashDamping, h);
      color.forEach((channel, i) =>
        stepSpring(channel, form.color[i] ?? 0, COLOR_OMEGA ** 2, 2 * COLOR_OMEGA, dt),
      );
      stepSpring(pupilSize, form.pupil, 220, 2 * 0.8 * Math.sqrt(220), dt);

      if (now > blinkAt + BLINK_SECONDS) blinkAt = now + 2.2 + Math.random() * 3;
      const blinkPhase = (now - blinkAt) / BLINK_SECONDS;
      const blink =
        form.blinks && blinkPhase >= 0 && blinkPhase <= 1
          ? 1 - 0.92 * Math.sin(Math.PI * blinkPhase)
          : 1;

      const s = clamp(squash.value, -0.35, 0.35);
      const cx = form.center.x;
      const warp = (x: number, y: number): Point => ({
        x: cx + (x - cx) * (1 + s),
        y: GROUND - (GROUND - Math.min(y, GROUND)) * (1 - s),
      });

      const outline = body.map(p => warp(p.x, p.y));
      const bounds = boundsOf(outline);
      if (!form.bridges.length && piecesJoined(outline, pieces)) pieces = NO_PIECES;
      bodyRef.current?.setAttribute("d", bodyPath(outline, pieces));
      const [L = 0, a = 0, b = 0] = color.map(channel => channel.value);
      bodyRef.current?.style.setProperty("fill", `oklab(${L.toFixed(4)} ${a.toFixed(4)} ${b.toFixed(4)})`);

      const eyeCenters = features.slice(0, 2).map(centroid);
      features.forEach((particles, i) => {
        const center = eyeCenters[i];
        const squeeze = center ? blink : 1;
        const pivot = center?.y ?? 0;
        featureRefs.current[i]?.setAttribute(
          "d",
          pathOf(particles.map(p => warp(p.x, pivot + (p.y - pivot) * squeeze))),
        );
      });

      const face = centroid(eyeCenters);
      const gaze = lookRef.current ?? {
        x: face.x + 70 * Math.sin(now * 0.6),
        y: face.y + 30 * Math.sin(now * 0.9),
      };
      const gx = gaze.x - face.x;
      const gy = gaze.y - face.y;
      const reach = (form.pupilTravel * Math.min(1, Math.hypot(gx, gy) / 80)) / (Math.hypot(gx, gy) || 1);
      stepSpring(look.x, gx * reach, 180, 2 * 0.75 * Math.sqrt(180), dt);
      stepSpring(look.y, gy * reach, 180, 2 * 0.75 * Math.sqrt(180), dt);
      eyeCenters.forEach((center, i) => {
        const pupil = pupilRefs.current[i];
        if (!pupil) return;
        const at = warp(center.x + look.x.value, center.y + look.y.value * blink);
        const radius = Math.max(0, pupilSize.value);
        pupil.setAttribute("cx", at.x.toFixed(1));
        pupil.setAttribute("cy", at.y.toFixed(1));
        pupil.setAttribute("rx", radius.toFixed(2));
        pupil.setAttribute("ry", (radius * blink).toFixed(2));
      });

      const lift = clamp((GROUND - bounds.maxY) / 50, 0, 1);
      const shadow = shadowRef.current;
      if (shadow) {
        shadow.setAttribute("cx", ((bounds.minX + bounds.maxX) / 2).toFixed(1));
        shadow.setAttribute("rx", ((bounds.maxX - bounds.minX) * 0.46 * (1 - 0.35 * lift)).toFixed(1));
        shadow.setAttribute("ry", (7 * (1 - 0.3 * lift)).toFixed(2));
        shadow.setAttribute("opacity", (0.13 * (1 - 0.6 * lift)).toFixed(3));
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const restEyes = REST_FORM.features.slice(0, 2).map(centroid);

  return (
    <svg
      ref={svgRef}
      viewBox={VIEW_BOX}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="A black blob pet that morphs into expressions, shapes, and words"
      style={{ display: "block", width: "100%", height: "100%", cursor: "pointer", touchAction: "manipulation" }}
      onPointerMove={event => {
        lookRef.current = toViewBox(svgRef.current, event.clientX, event.clientY);
      }}
      onPointerLeave={() => {
        lookRef.current = null;
      }}
      onPointerDown={() => {
        pokeRef.current += 1;
      }}
    >
      <ellipse
        ref={shadowRef}
        cx={0}
        cy={GROUND + 5}
        rx={BODY_HALF_WIDTH * 0.9}
        ry={7}
        fill={SHADOW_COLOR}
        opacity={0.13}
      />
      <path ref={bodyRef} d={pathOf(REST_FORM.body)} fill={REST.color} fillRule="nonzero" />
      {REST_FORM.features.map((contour, i) => (
        <path
          key={i}
          ref={element => {
            featureRefs.current[i] = element;
          }}
          d={pathOf(contour)}
          fill={FACE_COLOR}
        />
      ))}
      {restEyes.map((center, i) => (
        <ellipse
          key={i}
          ref={element => {
            pupilRefs.current[i] = element;
          }}
          cx={center.x}
          cy={center.y}
          rx={REST_FORM.pupil}
          ry={REST_FORM.pupil}
          fill={PUPIL_COLOR}
        />
      ))}
    </svg>
  );
}
