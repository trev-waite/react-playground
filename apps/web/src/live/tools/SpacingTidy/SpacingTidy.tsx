import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import { snapLineHeight, tidy, type SheetPlanner } from "@react-playground/layout-sheet";
import { SheetGuides, useSheet, useSheetState } from "@react-playground/layout-sheet/react";
import { Switch } from "@/live/controls/Switch/Switch";

const SLIDERS = {"squareSize":64,"fontSize":22,"columns":3};

const QUOTE_WIDTH = 248;
const QUOTE = "Whitespace is to be regarded as an active element, not a passive background.";
const CREDIT = "Jan Tschichold";
const COLORS = ["#2448d8", "#ff9f1c", "#5a9a4a", "#1c2430", "#e85d75", "#7c5cff", "#16a3a3", "#c2410c"];
const ROWS = 2;
/** The screen as first written: close to the scale, never on it. */
const START_LINE_HEIGHT = 1.38;
const JITTER_PX = 5;
const LINE_HEIGHT_PER_PIXEL = 0.002;
const LINE_HEIGHT_RANGE = [1, 2.2] as const;

const ceilTo8 = (value: number) => Math.ceil(value / 8) * 8;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Sized from the sliders, never from what the user drags, so the sheet does not shift mid-edit. */
function boardSize(columns: number, size: number, fontSize: number) {
  const grid = { width: columns * size + (columns - 1) * 24, height: ROWS * size + (ROWS - 1) * 24 };
  const lines = Math.ceil((QUOTE.length * fontSize * 0.5) / QUOTE_WIDTH);
  const text = lines * fontSize * 1.5 + 40;
  return {
    width: ceilTo8(48 + grid.width + 32 + QUOTE_WIDTH),
    height: ceilTo8(48 + Math.max(grid.height, text)),
  };
}

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function jitter(seed: number, ids: string[]) {
  const random = seeded(seed);
  const nudge = () => Math.round((random() * 2 - 1) * JITTER_PX);
  return Object.fromEntries(ids.map(id => [id, { x: nudge(), y: nudge() }]));
}

/** A planner too: a tidy layout, then every item nudged off it as if placed by hand. */
function scatterPlanner(seed: number): SheetPlanner {
  return ({ boxes }) => {
    const { positions } = tidy(boxes);
    const nudges = jitter(seed, boxes.map(box => box.id));
    return {
      positions: Object.fromEntries(
        Object.entries(positions).map(([id, at]) => [id, { x: at.x + nudges[id]!.x, y: at.y + nudges[id]!.y }]),
      ),
    };
  };
}

export function SpacingTidy({
  sliders = SLIDERS,
  progress = 1,
  aiPlanner,
}: {
  sliders?: Record<string, number>;
  progress?: number;
  /** Optional AI planner; when present, a toggle offers it beside rounding. */
  aiPlanner?: SheetPlanner;
} = {}) {
  const size = clamp(sliders.squareSize ?? SLIDERS.squareSize, 32, 96);
  const fontSize = clamp(sliders.fontSize ?? SLIDERS.fontSize, 14, 36);
  const columns = Math.round(clamp(sliders.columns ?? SLIDERS.columns, 2, 4));
  const board = boardSize(columns, size, fontSize);
  const squareIds = Array.from({ length: columns * ROWS }, (_, index) => `square-${index}`);

  const sheet = useSheet();
  const canUndo = useSheetState(sheet, snapshot => snapshot.canUndo);
  const [lineHeight, setLineHeight] = useState(START_LINE_HEIGHT);
  /** The line height before each plan, paired with the sheet's own undo history. */
  const [lineHeights, setLineHeights] = useState<number[]>([]);
  const [planning, setPlanning] = useState(false);
  const [useAi, setUseAi] = useState(false);
  const [showGuides, setShowGuides] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seed = useRef(7);
  const textRef = useRef<HTMLElement>(null);
  const lastProgress = useRef(progress);

  // The screen starts hand-placed: a few pixels off wherever its own CSS put things.
  useLayoutEffect(() => {
    sheet.setOffsets(jitter(seed.current, [...squareIds, "quote", "credit"]));
  }, [sheet]);

  useEffect(() => {
    const text = textRef.current;
    if (!text) return;
    const onWheel = (event: WheelEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".st-quote")) return;
      // Claim the wheel so a page around this component does not scroll too.
      event.preventDefault();
      const delta = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 16 : event.deltaY;
      setLineHeight(current => clamp(current - delta * LINE_HEIGHT_PER_PIXEL, ...LINE_HEIGHT_RANGE));
    };
    text.addEventListener("wheel", onWheel, { passive: false });
    return () => text.removeEventListener("wheel", onWheel);
  }, []);

  async function plan(planner: SheetPlanner | undefined, nextLineHeight: number) {
    if (planning) return;
    setPlanning(true);
    setError(null);
    const before = lineHeight;
    try {
      // Text reflows first, without moving anything, so the planner sees its final height.
      sheet.keepInPlace(() => flushSync(() => setLineHeight(nextLineHeight)));
      const { moved } = await sheet.tidy(planner);
      if (moved) setLineHeights(stack => [...stack, before]);
    } catch (error) {
      setError(`Could not plan the spacing: ${error instanceof Error ? error.message : "unknown error"}`);
    } finally {
      setPlanning(false);
    }
  }

  const perfect = () =>
    plan(useAi && aiPlanner ? aiPlanner : undefined, snapLineHeight(fontSize, lineHeight) / fontSize);

  const scatter = () => {
    seed.current += 1;
    return plan(scatterPlanner(seed.current), START_LINE_HEIGHT);
  };

  function undo() {
    const previous = lineHeights.at(-1);
    if (previous != null) {
      sheet.keepInPlace(() =>
        flushSync(() => {
          setLineHeight(previous);
          setLineHeights(stack => stack.slice(0, -1));
        }),
      );
    }
    sheet.undo();
    setError(null);
  }

  // Studio actions: Form tidies, Unform scatters, Replay does both. They run after the
  // effect, since planning flushes React synchronously and effects may not.
  useEffect(() => {
    const before = lastProgress.current;
    lastProgress.current = progress;
    if (progress <= 0.001 && before > 0.001) queueMicrotask(() => void scatter());
    else if (progress >= 0.999 && before < 0.999) queueMicrotask(() => void perfect());
  }, [progress]);

  function onQuoteKey(event: KeyboardEvent<HTMLElement>) {
    // The sheet leaves Alt alone, so Alt with up or down is free for the line height.
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    const step = event.key === "ArrowUp" ? 0.01 : -0.01;
    setLineHeight(current => clamp(current + step, ...LINE_HEIGHT_RANGE));
  }

  return (
    <div className="st-root">
      <style>{CSS}</style>
      <div
        ref={sheet.root}
        className="st-board"
        style={{ width: board.width, height: board.height }}
      >
        <div className="st-grid" style={{ gridTemplateColumns: `repeat(${columns}, ${size}px)` }}>
          {squareIds.map((id, index) => (
            <div
              key={id}
              ref={sheet.item(id, { group: "tiles" })}
              className="st-square"
              role="button"
              aria-roledescription="draggable"
              aria-label={`Square ${index + 1}`}
              style={{ borderRadius: Math.round(size * 0.22) }}
            >
              <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
                <rect width={size} height={size} rx={Math.round(size * 0.22)} fill={COLORS[index % COLORS.length]} />
              </svg>
            </div>
          ))}
        </div>

        <figure ref={textRef} className="st-text">
          <blockquote
            ref={sheet.item("quote", { group: "text" })}
            className="st-quote"
            role="button"
            aria-roledescription="draggable"
            aria-description="Arrow keys move it. Alt with up or down changes its line height."
            style={{ fontSize, lineHeight }}
            onKeyDown={onQuoteKey}
          >
            {QUOTE}
          </blockquote>
          <figcaption
            ref={sheet.item("credit", { group: "text" })}
            className="st-credit"
            role="button"
            aria-roledescription="draggable"
          >
            — {CREDIT}
          </figcaption>
        </figure>

        {showGuides ? <SheetGuides sheet={sheet} /> : null}
      </div>

      <div className="st-toolbar" style={{ width: board.width }}>
        {aiPlanner ? (
          <div className="st-mode" role="radiogroup" aria-label="Planner">
            {(["Rounding", "AI"] as const).map(mode => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={(mode === "AI") === useAi}
                className="st-modeOption"
                onClick={() => setUseAi(mode === "AI")}
              >
                {mode}
              </button>
            ))}
          </div>
        ) : null}
        <button type="button" className="st-primary" onClick={() => void perfect()} disabled={planning}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 1.5l1.6 4.4 4.4 1.6-4.4 1.6L8 13.5l-1.6-4.4L2 7.5l4.4-1.6z" fill="currentColor" />
          </svg>
          {planning ? "Planning…" : "Perfect spacing"}
        </button>
        <button type="button" className="st-secondary" onClick={undo} disabled={!canUndo || planning}>
          Undo
        </button>
        <label className="st-switch">
          Guides
          <Switch label="Guides" size="compact" defaultChecked onChange={setShowGuides} />
        </label>
        {error ? (
          <p className="st-status" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/*
 * The screen's own CSS, written by hand and a little off the scale on purpose:
 * 28px padding, 20px gutters, 36px to the text, 12px to the credit.
 */
const CSS = `
.st-root {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #1c2430;
}
.st-board {
  display: flex;
  align-items: flex-start;
  flex-shrink: 0;
  box-sizing: border-box;
  padding: 28px;
  overflow: hidden;
  border-radius: 24px;
  background-color: #ffffff;
  background-image: radial-gradient(rgba(28, 36, 48, 0.18) 1px, transparent 1px);
  background-size: 8px 8px;
  background-position: -4px -4px;
  box-shadow: 0 1px 2px rgba(28, 36, 48, 0.06), 0 12px 32px rgba(28, 36, 48, 0.1);
}
.st-grid { display: grid; gap: 20px; flex-shrink: 0; }
.st-square svg { display: block; }
.st-text { width: ${QUOTE_WIDTH}px; margin: 0 0 0 36px; flex-shrink: 0; }
.st-quote { margin: 0; font-weight: 600; letter-spacing: -0.015em; }
.st-credit { margin: 12px 0 0; font-size: 14px; line-height: 1.4; color: #5c6678; }
.st-board [data-sheet-item] { outline: none; }
.st-board [data-sheet-item]:focus-visible { outline: 2px solid #2448d8; outline-offset: 4px; }
.st-quote:focus-visible, .st-credit:focus-visible { border-radius: 4px; }
.st-toolbar { display: flex; align-items: center; gap: 8px; }
.st-primary, .st-secondary, .st-modeOption {
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  padding: 0 20px;
  border: 0;
  border-radius: 999px;
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 140ms cubic-bezier(0.23, 1, 0.32, 1), opacity 160ms ease;
}
@media (prefers-reduced-motion: reduce) {
  .st-primary, .st-secondary, .st-modeOption { transition: none; }
}
.st-primary { background: #1c2430; color: #ffffff; }
.st-secondary { background: #ffffff; color: #1c2430; box-shadow: inset 0 0 0 1px rgba(28, 36, 48, 0.14); }
.st-switch {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  box-sizing: border-box;
  height: 44px;
  padding: 0 6px 0 20px;
  border-radius: 999px;
  background: #ffffff;
  box-shadow: inset 0 0 0 1px rgba(28, 36, 48, 0.14);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
}
.st-primary:disabled, .st-secondary:disabled { opacity: 0.4; cursor: default; }
.st-primary:active:not(:disabled), .st-secondary:active:not(:disabled) { transform: scale(0.97); }
.st-primary:focus-visible, .st-secondary:focus-visible, .st-modeOption:focus-visible {
  outline: 2px solid #2448d8;
  outline-offset: 2px;
}
.st-mode { display: inline-flex; padding: 3px; border-radius: 999px; background: #ffffff; box-shadow: inset 0 0 0 1px rgba(28, 36, 48, 0.14); }
.st-modeOption { height: 38px; padding: 0 14px; background: transparent; color: #5c6678; }
.st-modeOption[aria-checked="true"] { background: #1c2430; color: #ffffff; }
.st-status {
  flex: 1;
  min-width: 0;
  margin: 0 0 0 8px;
  font-size: 13px;
  line-height: 1.4;
  color: #5c6678;
}
`;
