import {
  Component,
  Suspense,
  use,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { SourceFile } from "../../lib/types";
import { cardSource, fileTokens } from "./cardSource";
import styles from "./CodeSheet.module.css";

export type CodeSheetCard = { slug: string; title: string; members: readonly { slug: string }[] };

type CodeSheetProps = {
  card: CodeSheetCard;
  open: boolean;
  onClose: () => void;
};

/** Copy feedback stays up this long. */
const COPIED_MS = 1600;

/**
 * A card's source in a modal sheet: one tab per file, a copy button, and the
 * code. Plain text shows at once and takes its colors when the highlighter
 * has loaded, so nothing moves.
 */
export default function CodeSheet({ card, open, onClose }: CodeSheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // A drag outside the code would scroll the page under the sheet; phones scroll the document itself.
    const hold = (event: TouchEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest("[data-scrolls]")) event.preventDefault();
    };
    // A click on the backdrop lands on the dialog itself, outside its box. Escape and the close button do the same by keyboard.
    const dismiss = (event: MouseEvent) => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      const inside =
        event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
      if (!inside) dialog.close();
    };
    dialog.addEventListener("touchmove", hold, { passive: false });
    dialog.addEventListener("click", dismiss);
    return () => {
      dialog.removeEventListener("touchmove", hold);
      dialog.removeEventListener("click", dismiss);
    };
  }, []);

  return (
    <dialog ref={ref} className={styles.sheet} aria-labelledby={titleId} onClose={onClose}>
      <header className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          {card.title}
        </h2>
        <button type="button" className={styles.close} aria-label="Close code" onClick={() => ref.current?.close()}>
          <CloseIcon />
        </button>
      </header>
      <SourceBoundary key={card.slug}>
        <Suspense fallback={<Loading />}>
          <Files card={card} />
        </Suspense>
      </SourceBoundary>
    </dialog>
  );
}

function Files({ card }: { card: CodeSheetCard }) {
  const files = use(cardSource(card));
  const [selected, setSelected] = useState(0);
  const tabsId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const file = files[selected];

  if (!file) return <p className={styles.message}>This component has no source to show.</p>;

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const next =
      event.key === "Home" ? 0 : event.key === "End" ? files.length - 1 : step ? (index + step + files.length) % files.length : -1;
    if (next < 0) return;
    event.preventDefault();
    setSelected(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.tabs} role="tablist" aria-label="Files" data-scrolls>
          {files.map((each, index) => (
            <button
              key={each.name}
              ref={element => {
                tabRefs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`${tabsId}-${index}`}
              className={styles.tab}
              aria-selected={index === selected}
              aria-controls={`${tabsId}-panel`}
              tabIndex={index === selected ? 0 : -1}
              onClick={() => setSelected(index)}
              onKeyDown={event => onTabKey(event, index)}
            >
              {each.name}
            </button>
          ))}
        </div>
        <CopyButton code={file.code} />
      </div>
      <div
        id={`${tabsId}-panel`}
        className={styles.code}
        role="tabpanel"
        aria-labelledby={`${tabsId}-${selected}`}
        tabIndex={0}
        data-scrolls
      >
        <TokenBoundary key={file.name} fallback={<Lines file={file} />}>
          <Suspense fallback={<Lines file={file} />}>
            <HighlightedLines file={file} />
          </Suspense>
        </TokenBoundary>
      </div>
    </>
  );
}

/** Lines as `[text, color]` runs; plain lines have one uncolored run each. */
type Run = { content: string; color?: string };

function Code({ lines }: { lines: Run[][] }) {
  // A file's final newline is not a line of its own.
  const shown = lines.at(-1)?.every(run => run.content === "") ? lines.slice(0, -1) : lines;
  return (
    <pre className={styles.pre}>
      <code>
        {shown.map((runs, index) => (
          <span key={index} className={styles.line}>
            {runs.map((run, at) => (
              <span key={at} style={run.color ? { color: run.color } : undefined}>
                {run.content}
              </span>
            ))}
            {"\n"}
          </span>
        ))}
      </code>
    </pre>
  );
}

function Lines({ file }: { file: SourceFile }) {
  return <Code lines={file.code.split("\n").map(line => [{ content: line }])} />;
}

function HighlightedLines({ file }: { file: SourceFile }) {
  return <Code lines={use(fileTokens(file))} />;
}

function CopyButton({ code }: { code: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(code);
      setState("copied");
    } catch {
      setState("failed");
    }
    timer.current = setTimeout(() => setState("idle"), COPIED_MS);
  }

  return (
    <button type="button" className={styles.copy} data-state={state} onClick={copy}>
      {state === "copied" ? <CheckIcon /> : <CopyIcon />}
      <span aria-live="polite">{state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : "Copy"}</span>
    </button>
  );
}

function Loading() {
  return (
    <div className={styles.loading} role="status" aria-label="Loading code">
      {[72, 48, 88, 64, 40, 80, 56].map((width, index) => (
        <span key={index} className={styles.skeleton} style={{ width: `${width}%` }} />
      ))}
    </div>
  );
}

type BoundaryState = { failed: boolean };

/** The code could not be fetched: say so, and let the reader try again. */
class SourceBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  override state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className={styles.message} role="alert">
        <p>The code couldn’t load. Check your connection and try again.</p>
        <button type="button" className={styles.retry} onClick={() => this.setState({ failed: false })}>
          Try again
        </button>
      </div>
    );
  }
}

/** Highlighting failed: the plain code is still the code. */
class TokenBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, BoundaryState> {
  override state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="5.25" y="5.25" width="7.5" height="7.5" rx="1.75" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.75 3.25h-5.5a2 2 0 0 0-2 2v5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
