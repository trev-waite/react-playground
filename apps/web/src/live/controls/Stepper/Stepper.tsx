import { useState } from "react";
import styles from "./Stepper.module.css";

type StepperProps = {
  label: string;
  defaultValue?: number;
  min?: number;
  max?: number;
  step?: number;
  onChange?: (value: number) => void;
};

export function Stepper({ label, defaultValue = 0, min = -Infinity, max = Infinity, step = 1, onChange }: StepperProps) {
  const [value, setValue] = useState(defaultValue);
  const [direction, setDirection] = useState<"up" | "down">("up");

  function change(delta: number) {
    const next = Math.min(max, Math.max(min, value + delta));
    if (next === value) return;
    setDirection(delta > 0 ? "up" : "down");
    setValue(next);
    onChange?.(next);
  }

  return (
    <div className={styles.stepper} role="group" aria-label={label}>
      <span className={styles.label}>{label}</span>
      <button
        type="button"
        className={styles.button}
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onClick={() => change(-step)}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 8h9" />
        </svg>
      </button>
      <output className={styles.value} aria-live="polite">
        <span key={value} className={styles.digits} data-direction={direction}>
          {value}
        </span>
      </output>
      <button
        type="button"
        className={styles.button}
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onClick={() => change(step)}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 8h9M8 3.5v9" />
        </svg>
      </button>
    </div>
  );
}
