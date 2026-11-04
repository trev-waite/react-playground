import { useState } from "react";
import styles from "./Switch.module.css";

type SwitchProps = {
  label: string;
  defaultChecked?: boolean;
  /** Compact fits beside 44px buttons in a toolbar. */
  size?: "regular" | "compact";
  onChange?: (checked: boolean) => void;
};

export function Switch({ label, defaultChecked = false, size = "regular", onChange }: SwitchProps) {
  const [checked, setChecked] = useState(defaultChecked);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-size={size}
      className={styles.switch}
      onClick={() => {
        setChecked(!checked);
        onChange?.(!checked);
      }}
    >
      <span className={styles.thumb} aria-hidden="true" />
    </button>
  );
}
