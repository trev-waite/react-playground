/**
 * Demo-only preview content. Replace this file when experimenting with a
 * different component inside ConfigurableShell.
 */
import { useRef, type PointerEvent } from "react";
import { exampleMetrics } from "./exportExample";
import styles from "./ExamplePreview.module.css";

type ExamplePreviewProps = {
  tracking: number;
  weight: number;
  shift: number;
  panEnabled?: boolean;
  offset: { x: number; y: number };
  onOffsetChange: (offset: { x: number; y: number }) => void;
};

export function ExamplePreview({
  tracking,
  weight,
  shift,
  panEnabled = false,
  offset,
  onOffsetChange,
}: ExamplePreviewProps) {
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const m = exampleMetrics(tracking, weight, shift, offset);
  const typeStyle = {
    letterSpacing: `${m.letterSpacing}em`,
    fontWeight: m.fontWeight,
  };

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!panEnabled || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    onOffsetChange({
      x: drag.ox + (event.clientX - drag.x),
      y: drag.oy + (event.clientY - drag.y),
    });
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  return (
    <div
      className={styles.stage}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <svg className={styles.svg} viewBox="0 0 420 280" aria-hidden="true">
        <g transform={`translate(${m.panX} ${m.panY})`}>
          <text
            className={styles.ghost}
            x="210"
            y="152"
            textAnchor="middle"
            fill="none"
            stroke="#111113"
            strokeWidth={m.stroke}
            transform={`translate(${m.ghostX} ${m.ghostY})`}
            style={typeStyle}
          >
            Aa
          </text>
          <text
            className={styles.fill}
            x="210"
            y="152"
            textAnchor="middle"
            style={typeStyle}
          >
            Aa
          </text>
          <line
            className={styles.rule}
            x1={210 - m.rule / 2}
            y1="178"
            x2={210 + m.rule / 2}
            y2="178"
          />
        </g>
      </svg>
    </div>
  );
}
