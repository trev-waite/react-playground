import type { CSSProperties } from "react";
import styles from "./RelayDots.module.css";

/** Four dots: three slide one slot left while the fourth hops over them to the end of the line. */
export const DOT_COUNT = 4;
/** One handoff, in ms. A full lap is DOT_COUNT handoffs. */
export const STEP_MS = 420;

type RelayDotsProps = {
  /** Read by screen readers in place of the dots. */
  label?: string;
};

/** The slot dot `index` sits in at the start of handoff `step`: each handoff moves it one slot left, and slot 0 hops to the end. */
export function relaySlot(index: number, step: number, count = DOT_COUNT): number {
  return (((count - 1 - index - step) % count) + count) % count;
}

/** How many handoffs into its lap a dot in `slot` is, since every lap starts with the hop from slot 0. */
export function lapOffset(slot: number, count = DOT_COUNT): number {
  return (count - slot) % count;
}

function laneStyle(index: number): CSSProperties {
  const slot = relaySlot(index, 0);
  return { "--slot": slot, "--delay": `${-lapOffset(slot) * STEP_MS}ms` } as CSSProperties;
}

export function RelayDots({ label = "Loading" }: RelayDotsProps) {
  return (
    <span
      className={styles.dots}
      role="status"
      aria-label={label}
      style={{ "--count": DOT_COUNT, "--step": `${STEP_MS}ms` } as CSSProperties}
    >
      {Array.from({ length: DOT_COUNT }, (_, index) => (
        <span key={index} className={styles.lane} style={laneStyle(index)} aria-hidden="true">
          <span className={styles.dot} />
        </span>
      ))}
    </span>
  );
}
