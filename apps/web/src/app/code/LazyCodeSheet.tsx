import { Component, lazy, Suspense, useState, type ReactNode } from "react";
import type { CodeSheetCard } from "./CodeSheet";
import styles from "./LazyCodeSheet.module.css";

const loadSheet = () => import("./CodeSheet");

/** Fetches a card's code and the highlighter ahead of a press. A failure here only means the sheet fetches on open. */
export function prepareCode(card: CodeSheetCard): void {
  import("./cardSource").then(
    module => module.prepareCode(card),
    () => {},
  );
}

type LazyCodeSheetProps = {
  card: CodeSheetCard;
  open: boolean;
  onClose: () => void;
};

/**
 * The code sheet, loaded on first open. If its code cannot be fetched, the
 * reader is told so and may try again; the deck behind it is untouched.
 */
export function LazyCodeSheet({ card, open, onClose }: LazyCodeSheetProps) {
  // A lazy component keeps a failed load, so trying again needs a new one.
  const [Sheet, setSheet] = useState(() => lazy(loadSheet));
  return (
    <SheetBoundary open={open} onClose={onClose} onRetry={() => setSheet(() => lazy(loadSheet))}>
      <Suspense fallback={null}>
        <Sheet card={card} open={open} onClose={onClose} />
      </Suspense>
    </SheetBoundary>
  );
}

type SheetBoundaryProps = { open: boolean; onClose: () => void; onRetry: () => void; children: ReactNode };

class SheetBoundary extends Component<SheetBoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    if (!this.props.open) return null;
    return (
      <div className={styles.error} role="alert">
        <p className={styles.message}>The code couldn’t load. Check your connection and try again.</p>
        <button
          type="button"
          className={styles.retry}
          onClick={() => {
            this.props.onRetry();
            this.setState({ failed: false });
          }}
        >
          Try again
        </button>
        <button type="button" className={styles.close} aria-label="Close" onClick={this.props.onClose}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    );
  }
}
