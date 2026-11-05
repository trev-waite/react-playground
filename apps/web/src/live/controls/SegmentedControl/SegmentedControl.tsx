import { useId, useState, type CSSProperties } from "react";
import styles from "./SegmentedControl.module.css";

type SegmentedControlProps = {
  options: readonly string[];
  defaultValue?: string;
  label: string;
  onChange?: (value: string) => void;
};

export function SegmentedControl({ options, defaultValue, label, onChange }: SegmentedControlProps) {
  const [value, setValue] = useState(defaultValue ?? options[0]);
  const name = useId();
  const index = Math.max(0, options.indexOf(value ?? ""));

  return (
    <div
      className={styles.track}
      role="radiogroup"
      aria-label={label}
      style={{ "--count": options.length, "--index": index } as CSSProperties}
    >
      <span className={styles.pill} aria-hidden="true" />
      {options.map(option => (
        <label key={option} className={styles.option} data-active={option === value || undefined}>
          <input
            className={styles.input}
            type="radio"
            name={name}
            value={option}
            checked={option === value}
            onChange={() => {
              setValue(option);
              onChange?.(option);
            }}
          />
          {option}
        </label>
      ))}
    </div>
  );
}
