import { useLayoutEffect, useRef, type ReactNode } from "react";
import { numberColumns } from "./numberColumns";
import styles from "./PrimaryButton.module.css";

type PrimaryButtonProps = {
  children: ReactNode;
  count?: number;
  suffix?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
};

function RollingNumber({ value }: { value: number }) {
  const previousValueRef = useRef(value);
  const previousValue = previousValueRef.current;
  const transitioning = previousValue !== value;
  const valueText = String(value);

  useLayoutEffect(() => {
    previousValueRef.current = value;
  }, [value]);

  return (
    <>
      <span
        className={styles.numberViewport}
        style={{ width: `${Math.max(1, valueText.length)}ch` }}
        aria-hidden="true"
      >
        {transitioning ? (
          <span
            className={styles.numberTransition}
            key={`${previousValue}-${value}`}
          >
            {numberColumns(previousValue, value).map(
              (column, index) => (
                <span className={styles.digitColumn} key={index}>
                  {column.changed ? (
                    <>
                      {column.from == null ? null : (
                        <span className={styles.numberOutgoing}>
                          {column.from}
                        </span>
                      )}
                      {column.to == null ? null : (
                        <span className={styles.numberIncoming}>{column.to}</span>
                      )}
                    </>
                  ) : (
                    <span className={styles.numberUnchanged}>{column.to}</span>
                  )}
                </span>
              ),
            )}
          </span>
        ) : (
          <span className={styles.numberStatic}>{value}</span>
        )}
      </span>
      <span className={styles.srOnly} aria-live="polite">
        {value}
      </span>
    </>
  );
}

export function PrimaryButton({
  children,
  count,
  suffix,
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
      <span className={styles.label}>{children}</span>
      {count == null ? null : <RollingNumber value={count} />}
      {suffix == null ? null : <span className={styles.suffix}>{suffix}</span>}
    </button>
  );
}
