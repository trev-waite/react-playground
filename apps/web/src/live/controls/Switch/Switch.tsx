import { useState } from "react";
import styles from "./Switch.module.css";

type SwitchProps = {
  label: string;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
};

export function Switch({ label, defaultChecked = false, onChange }: SwitchProps) {
  const [checked, setChecked] = useState(defaultChecked);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
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
