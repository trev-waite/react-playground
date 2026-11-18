import {
  Component,
  Suspense,
  use,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { SourceFile } from "../../lib/types";
import { agentPrompt, type PromptCard } from "./agentPrompt";
import { cardSource, fileTokens } from "./cardSource";
import { holdPageUnder } from "./sheetTouch";
import type { Run } from "./tokenize";
import styles from "./CodeSheet.module.css";

type CodeSheetProps = {
  card: PromptCard;
  /** The press this sheet shows, so a new one after a failed fetch starts the sheet afresh. */
  attempt: number;
  open: boolean;
  onClose: () => void;
};

/** Copy feedback stays up this long. */
const COPIED_MS = 1600;

/**
 * A card's source in a modal sheet: one tab per file, a copy button, and the
 * code, plus a prompt that hands the component to the reader's coding agent.
 * Plain text shows at once and takes its colors when the highlighter has
 * loaded, so nothing moves.
 */
export function CodeSheet({ card, attempt, open, onClose }: CodeSheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // The sheet itself takes focus: a control focused on open shows a ring a touch never asked for.
      dialog.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // A click on the backdrop lands on the dialog itself, outside its box. Escape and the close button do the same by keyboard.
    const dismiss = (event: MouseEvent) => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      const inside =
        event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
      if (!inside) dialog.close();
    };
    const release = holdPageUnder(dialog);
    dialog.addEventListener("click", dismiss);
    return () => {
      release();
      dialog.removeEventListener("click", dismiss);
    };
  }, []);

  return (
    <dialog ref={ref} className={styles.sheet} tabIndex={-1} aria-labelledby={titleId} onClose={onClose}>
      <header className={styles.header}>
        <h2 id={titleId} className={styles.title}>
          {card.title}
        </h2>
        <button type="button" className={styles.close} aria-label="Close code" onClick={() => ref.current?.close()}>
          <CloseIcon />
        </button>
      </header>
      <SourceBoundary key={`${card.slug}:${attempt}`}>
        <Suspense fallback={<Loading />}>
          <Files card={card} />
        </Suspense>
      </SourceBoundary>
      <footer className={styles.footer}>
        <CopyButton
          text={() => agentPrompt(card, window.location.origin)}
          label="Prompt"
          name="Copy prompt"
          className={styles.prompt}
          title="Copy a prompt for your coding agent"
        />
      </footer>
    </dialog>
  );
}

function Files({ card }: { card: PromptCard }) {
  const files = use(cardSource(card));
  const [selected, setSelected] = useState(0);
  const tabsId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const tabsRef = useRef<HTMLDivElement>(null);
  const file = files[selected];
  const tabbed = files.length > 1;

  // The row fades only toward files still out of view, so the last tab reads in full once it is reached.
  useLayoutEffect(() => {
    const tabs = tabsRef.current;
    if (!tabs) return;
    const update = () => {
      tabs.toggleAttribute("data-more-start", tabs.scrollLeft > 1);
      tabs.toggleAttribute("data-more-end", tabs.scrollLeft + tabs.clientWidth < tabs.scrollWidth - 1);
    };
    update();
    tabs.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(tabs);
    return () => {
      tabs.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [tabbed]);

  useEffect(() => {
    tabRefs.current[selected]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selected]);

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
    <div className={styles.panel}>
      <div className={styles.bar}>
        {tabbed ? (
          <div ref={tabsRef} className={styles.tabs} role="tablist" aria-label="Files" data-scrolls>
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
        ) : (
          <p id={`${tabsId}-0`} className={styles.fileName}>
            {file.name}
          </p>
        )}
        <CopyButton key={file.name} text={() => file.code} label="Copy code" className={styles.copy} title="Copy code" />
      </div>
      <div
        key={file.name}
        id={`${tabsId}-panel`}
        className={styles.code}
        role={tabbed ? "tabpanel" : "region"}
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
    </div>
  );
}


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

type CopyButtonProps = {
  text: () => string;
  /** What the button reads. */
  label: string;
  /** What it is called to assistive tech, when its label is short. Copy feedback still speaks. */
  name?: string;
  className?: string;
  title?: string;
};

function CopyButton({ text, label, name, className, title }: CopyButtonProps) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(text());
      setState("copied");
    } catch {
      setState("failed");
    }
    timer.current = setTimeout(() => setState("idle"), COPIED_MS);
  }

  return (
    <button type="button" className={className} data-state={state} title={title} aria-label={name} onClick={copy}>
      <span className={styles.iconSwap} data-state={state} aria-hidden="true">
        <span className={styles.swapIcon} data-icon="idle">
          <CopyIcon />
        </span>
        <span className={styles.swapIcon} data-icon="copied">
          <CheckIcon />
        </span>
        <span className={styles.swapIcon} data-icon="failed">
          <FailIcon />
        </span>
      </span>
      <span className={styles.copyLabel} aria-live="polite">
        {state === "copied" ? "Copied" : state === "failed" ? "Copy failed" : label}
      </span>
    </button>
  );
}

function Loading() {
  return (
    <div className={styles.panel} role="status" aria-label="Loading code">
      <div className={styles.bar}>
        <p className={styles.barNote}>Loading code…</p>
      </div>
      <div className={styles.loading}>
        {[72, 48, 88, 64, 40, 80, 56].map((width, index) => (
          <span key={index} className={styles.skeleton} style={{ width: `${width}%` }} />
        ))}
      </div>
    </div>
  );
}

type BoundaryState = { failed: boolean };
/** The code could not be fetched. The sheet closes and a toast says so (`useCodeSheet`), so it shows nothing meanwhile. */
class SourceBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  override state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? null : this.props.children;
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

function FailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="5.75" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 5v3.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="10.75" r="0.85" fill="currentColor" />
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
