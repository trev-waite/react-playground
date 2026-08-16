/**
 * Demo-only preview content. Replace this file when experimenting with a
 * different component inside ConfigurableShell.
 */
import { useEffect, useRef, type PointerEvent } from "react";
import { blobPath } from "./exportExample";
import styles from "./ExamplePreview.module.css";

type ExamplePreviewProps = {
  form: number;
  soft: number;
  drift: number;
  panEnabled?: boolean;
  offset: { x: number; y: number };
  onOffsetChange: (offset: { x: number; y: number }) => void;
};

export function ExamplePreview({
  form,
  soft,
  drift,
  panEnabled = false,
  offset,
  onOffsetChange,
}: ExamplePreviewProps) {
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const fillRef = useRef<SVGPathElement>(null);
  const ghostRef = useRef<SVGPathElement>(null);
  const paramsRef = useRef({ form, soft, drift });
  paramsRef.current = { form, soft, drift };

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const origin = performance.now();

    const tick = (now: number) => {
      const { form: f, soft: s, drift: d } = paramsRef.current;
      const t = reduce ? 0 : (now - origin) / 1000;
      fillRef.current?.setAttribute("d", blobPath(f, s, d, t, 0));
      ghostRef.current?.setAttribute("d", blobPath(f, s, d, t + 0.55, 0.4));
      if (!reduce) frame = requestAnimationFrame(tick);
    };

    if (reduce) {
      tick(origin);
      return;
    }

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

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
        <g transform={`translate(${offset.x * 0.35} ${offset.y * 0.35})`}>
          <path
            ref={ghostRef}
            className={styles.ghost}
            d={blobPath(form, soft, drift, 0, 0.4)}
            fill="none"
            stroke="#111113"
            strokeWidth="1.4"
          />
          <path ref={fillRef} className={styles.fill} d={blobPath(form, soft, drift)} fill="#111113" />
        </g>
      </svg>
    </div>
  );
}
