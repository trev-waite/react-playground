import styles from "./PulseDot.module.css";

type PulseDotProps = {
  label?: string;
  tone?: "live" | "idle";
};

/**
 * Portable status indicator — copy with PulseDot.module.css.
 */
export function PulseDot({ label = "Live", tone = "live" }: PulseDotProps) {
  return (
    <span className={styles.root} data-tone={tone}>
      <span className={styles.dot} aria-hidden="true" />
      <span className={styles.label}>{label}</span>
    </span>
  );
}
