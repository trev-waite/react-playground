import type { ReactNode } from "react";
import styles from "./PrimaryButton.module.css";

type PrimaryButtonProps = {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
};

/**
 * Portable button — copy this file + PrimaryButton.module.css into another app.
 */
export function PrimaryButton({
  children,
  onClick,
  disabled,
}: PrimaryButtonProps) {
  return (
    <button
      type="button"
      className={styles.button}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
