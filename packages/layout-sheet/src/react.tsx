import { useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import { measureGaps, type AnalyzeOptions, type Gap } from "./analyze";
import { snapSpacing } from "./scale";
import { Sheet, type SheetOptions, type SheetSnapshot } from "./sheet";

/**
 * One sheet for the life of a component. Options are read once.
 *
 *   const sheet = useSheet();
 *   <main ref={sheet.root}>
 *     <img ref={sheet.item("logo")} />
 *     <SheetGuides sheet={sheet} />
 *   </main>
 */
export function useSheet(options?: SheetOptions): Sheet {
  const [sheet] = useState(() => new Sheet(options));
  useEffect(() => () => sheet.dispose(), [sheet]);
  return sheet;
}

/** Subscribes to part of the sheet; re-renders only when that part changes. */
export function useSheetState<T>(sheet: Sheet, select: (snapshot: SheetSnapshot) => T): T {
  return useSyncExternalStore(sheet.subscribe, () => select(sheet.getSnapshot()));
}

const snapshotOf = (snapshot: SheetSnapshot) => snapshot;

type SheetGuidesProps = AnalyzeOptions & {
  sheet: Sheet;
  /** Whether a gap is on the scale. Defaults to the 8px scale with 2 and 4 for tiny gaps. */
  onScale?: (value: number) => boolean;
  className?: string;
};

const TICK = 4;
const LABEL_SIZE = 10;
/** Space between the label and the line on either side of it. */
const LABEL_BREAK = 3;
/** Rough width of a tabular digit, in ems. */
const DIGIT_WIDTH = 0.62;
const LABEL_STYLE: CSSProperties = { fontVariantNumeric: "tabular-nums", letterSpacing: "0.01em" };

/**
 * Lines across every gap, each broken around its size in px: amber while it is off
 * the scale, green once it is on it.
 * Place it inside the sheet's root; it never takes pointer input.
 */
export function SheetGuides({ sheet, onScale = isOnScale, className, alignTolerance }: SheetGuidesProps) {
  const { boxes, bounds, settling } = useSheetState(sheet, snapshotOf);
  const gaps = measureGaps([...boxes], { alignTolerance }).filter(gap => gap.value > 0.5);
  return (
    <svg
      className={className}
      width={bounds.width}
      height={bounds.height}
      style={{ ...GUIDES_STYLE, opacity: settling ? 0 : 1 }}
      aria-hidden="true"
    >
      {gaps.map(gap => (
        <GapLine key={`${gap.axis}-${gap.from ?? "edge"}-${gap.to}`} gap={gap} on={onScale(gap.value)} />
      ))}
    </svg>
  );
}

function GapLine({ gap, on }: { gap: Gap; on: boolean }) {
  const [from, to] = gap.line;
  const horizontal = gap.axis === "x";
  const tick = horizontal ? { x: 0, y: TICK } : { x: TICK, y: 0 };
  const color = on ? "var(--sheet-guide-on, #15803d)" : "var(--sheet-guide-off, #b45309)";
  const text = `${Math.round(gap.value)}`;
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  // Room the label takes along the line, plus the break on either side of it.
  const half = (horizontal ? text.length * LABEL_SIZE * DIGIT_WIDTH : LABEL_SIZE) / 2 + LABEL_BREAK;
  const span = horizontal ? to.x - from.x : to.y - from.y;
  const inline = span >= 2 * (half + LABEL_BREAK);
  const cut = horizontal ? { x: half, y: 0 } : { x: 0, y: half };
  // A gap too short to break sits its label beside the line instead.
  const label = inline
    ? mid
    : horizontal
      ? { x: mid.x, y: mid.y - TICK - LABEL_BREAK - LABEL_SIZE / 2 }
      : { x: mid.x + TICK + LABEL_BREAK, y: mid.y };

  return (
    <g data-on-scale={on || undefined}>
      <g stroke={color} strokeWidth={1.5} strokeLinecap="round">
        {inline ? (
          <>
            <line x1={from.x} y1={from.y} x2={mid.x - cut.x} y2={mid.y - cut.y} />
            <line x1={mid.x + cut.x} y1={mid.y + cut.y} x2={to.x} y2={to.y} />
          </>
        ) : (
          <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
        )}
        {gap.from ? (
          <line x1={from.x - tick.x} y1={from.y - tick.y} x2={from.x + tick.x} y2={from.y + tick.y} />
        ) : null}
        <line x1={to.x - tick.x} y1={to.y - tick.y} x2={to.x + tick.x} y2={to.y + tick.y} />
      </g>
      <text
        x={label.x}
        y={label.y}
        fill={color}
        fontSize={LABEL_SIZE}
        fontWeight={600}
        textAnchor={inline || horizontal ? "middle" : "start"}
        dominantBaseline="central"
        style={LABEL_STYLE}
      >
        {text}
      </text>
    </g>
  );
}

function isOnScale(value: number): boolean {
  return Math.abs(value - snapSpacing(value)) < 0.5;
}

const GUIDES_STYLE: CSSProperties = {
  position: "absolute",
  top: 0,
  left: 0,
  overflow: "visible",
  pointerEvents: "none",
  transition: "opacity 160ms ease",
};

export { Sheet } from "./sheet";
export type { SheetOptions, SheetSnapshot } from "./sheet";
