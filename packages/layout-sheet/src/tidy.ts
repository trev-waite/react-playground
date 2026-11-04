import { alignedEdges, measureGaps, type AnalyzeOptions, type Gap } from "./analyze";
import { length, start, type Axis, type Point, type SheetBox } from "./geometry";
import { gapTolerance, snapSpacing, typicalGap } from "./scale";

/** The spacing a layout uses: one inset, one gap between groups, and a gutter per group. */
export type SpacingSystem = {
  inset: number;
  between: number;
  /** Keyed by group; "" holds items without one. */
  gutters: Record<string, number>;
};

export type TidyPlan = {
  /** Where each item's top-left corner goes. */
  positions: Record<string, Point>;
  spacing: SpacingSystem;
};

export type TidyOptions = AnalyzeOptions & {
  /** Rounds a gap onto the spacing scale. */
  snap?: (value: number) => number;
  /** How much further apart unrelated groups sit than the widest gutter. */
  groupStep?: number;
};

const DEFAULT_GROUP_STEP = 8;

function typicalOf(gaps: Gap[]): number {
  return typicalGap(gaps.map(gap => Math.max(0, gap.value)));
}

/** The user's own spacing (typical gaps, per kind) and that spacing snapped onto the scale. */
function spacingOf(gaps: Gap[], snap: (value: number) => number, groupStep: number) {
  const groups = [...new Set(gaps.flatMap(gap => (gap.kind === "gutter" ? [gap.group ?? ""] : [])))];
  const measured: SpacingSystem = {
    inset: typicalOf(gaps.filter(gap => gap.kind === "inset")),
    between: typicalOf(gaps.filter(gap => gap.kind === "between")),
    gutters: Object.fromEntries(
      groups.map(group => [group, typicalOf(gaps.filter(gap => gap.kind === "gutter" && gap.group === group))]),
    ),
  };
  const gutters = Object.fromEntries(groups.map(group => [group, snap(measured.gutters[group]!)]));
  const widest = Math.max(0, ...Object.values(gutters));
  const spacing: SpacingSystem = {
    inset: snap(measured.inset),
    // Unrelated groups sit further apart than related items, so the eye reads them as two.
    between: Math.max(snap(measured.between), widest > 0 ? widest + groupStep : 0),
    gutters,
  };
  return { measured, spacing };
}

/**
 * The default planner. Each kind of gap is averaged over what the user made (their
 * spacing is the intent), snapped to the scale, then applied everywhere: an item sits
 * that far from the one ahead of it, and edges that nearly lined up line up exactly.
 * Gutters inside a group always come out even. A gap between groups, or from the
 * edge, that is much wider than usual was left wide on purpose, so it is only snapped.
 */
export function tidy(boxes: SheetBox[], options: TidyOptions = {}): TidyPlan {
  const snap = options.snap ?? snapSpacing;
  const gaps = measureGaps(boxes, options);
  const { measured, spacing } = spacingOf(gaps, snap, options.groupStep ?? DEFAULT_GROUP_STEP);
  const byId = new Map(boxes.map(box => [box.id, box]));

  const settled = (value: number, typical: number, snapped: number) =>
    value <= typical + gapTolerance(typical) ? snapped : snap(value);
  // A group is one grid, so its gutters always come out even.
  const target = (gap: Gap) =>
    gap.kind === "between"
      ? settled(gap.value, measured.between, spacing.between)
      : spacing.gutters[gap.group ?? ""]!;

  function solve(axis: Axis): Map<string, number> {
    const solved = new Map<string, number>();
    const ahead = new Map(gaps.filter(gap => gap.axis === axis && gap.from).map(gap => [gap.to, gap]));
    const edges = alignedEdges(boxes, axis, options.alignTolerance);
    const edgeOf = new Map(edges.flatMap(edge => edge.map(box => [box.id, edge] as const)));
    const visiting = new Set<SheetBox[]>();

    // An overlapping item can start before the one it follows, so place what an edge
    // follows first. A cycle (only possible through overlaps) measures from where it is.
    function place(edge: SheetBox[]) {
      if (solved.has(edge[0]!.id) || visiting.has(edge)) return;
      visiting.add(edge);
      const candidates = edge.flatMap(box => {
        const gap = ahead.get(box.id);
        const before = gap?.from ? byId.get(gap.from) : undefined;
        if (!gap || !before) return [];
        place(edgeOf.get(before.id)!);
        const from = solved.get(before.id) ?? start(before.rect, axis);
        return [from + length(before.rect, axis) + target(gap)];
      });
      const value =
        candidates.length > 0
          ? Math.max(...candidates)
          : settled(start(edge[0]!.rect, axis), measured.inset, spacing.inset);
      for (const box of edge) solved.set(box.id, value);
    }

    for (const edge of edges) place(edge);
    return solved;
  }

  const xs = solve("x");
  const ys = solve("y");
  return {
    positions: Object.fromEntries(boxes.map(box => [box.id, { x: xs.get(box.id)!, y: ys.get(box.id)! }])),
    spacing,
  };
}
