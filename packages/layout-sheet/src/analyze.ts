import {
  center,
  end,
  other,
  overlap,
  start,
  type Axis,
  type Point,
  type SheetBox,
} from "./geometry";

/** Inset: from the sheet's edge. Gutter: between related items. Between: between groups. */
export type GapKind = "inset" | "gutter" | "between";

/** One gap on the sheet: from an item (or the edge) to the next item along an axis. */
export type Gap = {
  axis: Axis;
  kind: GapKind;
  /** The item before, or null for the sheet's edge. */
  from: string | null;
  to: string;
  /** The group whose gutter this is; "" for items without one. */
  group?: string;
  value: number;
  /** Where to draw it: across the span the two items share. */
  line: [Point, Point];
};

export type AnalyzeOptions = {
  /** Starts this close together read as one aligned edge. */
  alignTolerance?: number;
};

const DEFAULT_ALIGN_TOLERANCE = 8;
const groupOf = (box: SheetBox) => box.group ?? "";

/**
 * Whether `before` comes ahead of `box` along `axis`: the two share a span on the other
 * axis, and when they overlap outright, this is the axis that separates them more.
 */
function precedes(before: SheetBox, box: SheetBox, axis: Axis): boolean {
  const across = other(axis);
  if (before === box || overlap(before.rect, box.rect, across) <= 0) return false;
  const along = center(box.rect, axis) - center(before.rect, axis);
  if (along <= 0) return false;
  if (overlap(before.rect, box.rect, axis) <= 0) return true;
  return along >= Math.abs(center(box.rect, across) - center(before.rect, across));
}

/** The nearest item ahead of `box` along `axis`, if any. */
export function predecessor(boxes: SheetBox[], box: SheetBox, axis: Axis): SheetBox | null {
  let nearest: SheetBox | null = null;
  for (const candidate of boxes) {
    if (!precedes(candidate, box, axis)) continue;
    if (!nearest || end(candidate.rect, axis) > end(nearest.rect, axis)) nearest = candidate;
  }
  return nearest;
}

/**
 * Items whose starts line up along `axis`, ordered by where they start. Starts chain
 * together when each is within the tolerance of the last.
 */
export function alignedEdges(boxes: SheetBox[], axis: Axis, tolerance = DEFAULT_ALIGN_TOLERANCE): SheetBox[][] {
  const sorted = [...boxes].sort((a, b) => start(a.rect, axis) - start(b.rect, axis));
  const edges: SheetBox[][] = [];
  for (const box of sorted) {
    const edge = edges.at(-1);
    const last = edge?.at(-1);
    if (edge && last && start(box.rect, axis) - start(last.rect, axis) <= tolerance) edge.push(box);
    else edges.push([box]);
  }
  return edges;
}

function sharedMiddle(a: SheetBox, b: SheetBox, axis: Axis): number {
  const lo = Math.max(start(a.rect, axis), start(b.rect, axis));
  const hi = Math.min(end(a.rect, axis), end(b.rect, axis));
  return (lo + hi) / 2;
}

function point(axis: Axis, along: number, across: number): Point {
  return axis === "x" ? { x: along, y: across } : { x: across, y: along };
}

/**
 * Every gap on one axis. An item measures from the nearest item ahead of it; an edge
 * of aligned items with nothing ahead of any of them measures from the sheet's edge.
 * Items aligned to something that has a neighbor are placed by that alignment, so they
 * get no inset of their own.
 */
export function gapsOn(boxes: SheetBox[], axis: Axis, options: AnalyzeOptions = {}): Gap[] {
  const gaps: Gap[] = [];
  const across = other(axis);
  for (const edge of alignedEdges(boxes, axis, options.alignTolerance)) {
    const ahead = edge.map(box => [box, predecessor(boxes, box, axis)] as const);
    const anchored = ahead.some(([, before]) => before);
    for (const [box, before] of ahead) {
      const to = start(box.rect, axis);
      if (before) {
        const from = end(before.rect, axis);
        const at = sharedMiddle(before, box, across);
        const related = groupOf(before) === groupOf(box);
        gaps.push({
          axis,
          kind: related ? "gutter" : "between",
          from: before.id,
          to: box.id,
          ...(related ? { group: groupOf(box) } : null),
          value: to - from,
          line: [point(axis, from, at), point(axis, to, at)],
        });
      } else if (!anchored) {
        const at = center(box.rect, across);
        gaps.push({
          axis,
          kind: "inset",
          from: null,
          to: box.id,
          value: to,
          line: [point(axis, 0, at), point(axis, to, at)],
        });
      }
    }
  }
  return gaps;
}

/** Every gap on the sheet, both axes. */
export function measureGaps(boxes: SheetBox[], options: AnalyzeOptions = {}): Gap[] {
  return [...gapsOn(boxes, "x", options), ...gapsOn(boxes, "y", options)];
}
