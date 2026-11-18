import { useEffect, useRef } from "react";
import { MAX_RETRIES, type CodeFailure } from "./useCodeSheet";
import styles from "./CodeError.module.css";

type CodeErrorProps = {
  failure: CodeFailure;
  onRetry: () => void;
  onDismiss: () => void;
};

/**
 * The code could not load: say so, and let the reader try again, or after
 * `MAX_RETRIES` tries, refresh. Its button takes focus when it appears, so the
 * next step is one key away, and keeps it through each try.
 */
export function CodeError({ failure, onRetry, onDismiss }: CodeErrorProps) {
  const actionRef = useRef<HTMLButtonElement>(null);
  const spent = failure.retries >= MAX_RETRIES;

  useEffect(() => {
    actionRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className={styles.error}>
      <p className={styles.message} role="alert">
        {spent ? "Still couldn’t load the code." : "Couldn’t load the code. Check your connection."}
      </p>
      {/* The message reads the same after each failed try, so the try's own result is announced here. */}
      <span className={styles.srOnly} aria-live="polite">
        {failure.retries > 0 && !failure.trying ? `Try ${failure.retries} of ${MAX_RETRIES} didn’t load the code.` : ""}
      </span>
      <div className={styles.actions}>
        <button
          ref={actionRef}
          type="button"
          className={styles.retry}
          aria-busy={failure.trying || undefined}
          onClick={event => {
            // Safari moves focus to the page on a tap; the button keeps it through the try.
            event.currentTarget.focus({ preventScroll: true });
            if (spent) window.location.reload();
            else onRetry();
          }}
        >
          {spent ? (
            "Refresh page"
          ) : (
            // Both labels share one cell, so the button holds the wider one's width at any text size.
            <span className={styles.labels}>
              <span aria-hidden={failure.trying || undefined} data-hidden={failure.trying || undefined}>
                Try again
              </span>
              <span aria-hidden={!failure.trying || undefined} data-hidden={!failure.trying || undefined}>
                Trying…
              </span>
            </span>
          )}
        </button>
        <button type="button" className={styles.close} aria-label="Dismiss" onClick={onDismiss}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
