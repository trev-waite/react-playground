/**
 * Demo-only preview visual. Omit this file when exporting ConfigurableShell.
 */
import { useRef, type PointerEvent } from "react";
import styles from "./TypeSpecimen.module.css";

export type TypeSpecimenProps = {
  tracking: number;
  weight: number;
  shift: number;
  panEnabled?: boolean;
  offset: { x: number; y: number };
  onOffsetChange: (offset: { x: number; y: number }) => void;
};

export function TypeSpecimen({
  tracking,
  weight,
  shift,
  panEnabled = false,
  offset,
  onOffsetChange,
}: TypeSpecimenProps) {
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const letterSpacing = -0.09 + (tracking / 100) * 0.32;
  const fontWeight = 400 + Math.round((weight / 100) * 400);
  const stroke = 0.7 + (weight / 100) * 2.1;
  const ghostX = (shift / 100) * 14;
  const ghostY = (shift / 100) * 5.5;
  const panX = offset.x * 0.35;
  const panY = offset.y * 0.35;
  const rule = 52 + (tracking / 100) * 86;

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
        <g transform={`translate(${panX} ${panY})`}>
          <text
            className={styles.ghost}
            x="210"
            y="142"
            textAnchor="middle"
            fill="none"
            stroke="#111113"
            strokeWidth={stroke}
            transform={`translate(${ghostX} ${ghostY})`}
            style={{ letterSpacing: `${letterSpacing}em`, fontWeight }}
          >
            Quiet
          </text>
          <text
            className={styles.fill}
            x="210"
            y="142"
            textAnchor="middle"
            style={{ letterSpacing: `${letterSpacing}em`, fontWeight }}
          >
            Quiet
          </text>
          <line
            className={styles.rule}
            x1={210 - rule / 2}
            y1="168"
            x2={210 + rule / 2}
            y2="168"
          />
          <text className={styles.caption} x="210" y="192" textAnchor="middle">
            Specimen
          </text>
        </g>
      </svg>
    </div>
  );
}
