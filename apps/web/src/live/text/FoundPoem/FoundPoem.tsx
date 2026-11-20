import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { cascadeDelays, glide, MOTION, play, positionIn, type Move, type Playback } from "@/live/shared/Stage/choreography";
import { Stage } from "@/live/shared/Stage/Stage";
import stageStyles from "@/live/shared/Stage/Stage.module.css";
import { keptPoem, moveFocus, toggle } from "./poem";
import styles from "./FoundPoem.module.css";

const PASSAGE =
  "Today is the very first day of the rest of my life. This is the beginning of a new day. I have been given this day to use as I will. I can waste it … or use it for good, but what I do today is important, because I am exchanging a day of my life for it. When tomorrow comes, this day will be gone forever, leaving in its place something I have traded for it. I want it to be gain and not loss; good and not evil; success and not failure; in order that I shall not regret the price I have paid for it. I will try just for today, for you will never fail until you stop trying.";
const SOURCE = "Author unknown";

/** A poem already marked when the card opens, so there is something to erase: “Today I am exchanging a day of my life I shall not regret the price.” */
const SUGGESTED = [0, 49, 50, 51, 52, 53, 54, 55, 56, 98, 99, 100, 101, 102, 103];

/** The erased words are well on their way out before the kept ones start to gather. */
const GATHER_DELAY_MS = 280;
const GATHER_STAGGER_MS = 24;
/** Once gathered, the poem comes forward to this size, or as near as the passage's space allows. */
const POEM_GROW = 1.35;

type Mode = "passage" | "poem";

function wordsOf(container: Element | null) {
  return container ? Array.from(container.querySelectorAll<HTMLElement>("[data-index]")) : [];
}

/** Where each word is drawn right now, mid-glide included, keyed by its place in the passage. */
function drawnAt(root: Element, words: HTMLElement[]): Map<string | undefined, { x: number; y: number }> {
  return new Map(words.map(element => [element.dataset.index, positionIn(root, element)]));
}

/** Each kept word glides from where its twin was drawn in the other layer. */
function gatherMoves(root: Element, origins: Map<string | undefined, { x: number; y: number }>, to: HTMLElement[]): Move[] {
  return to.flatMap(element => {
    const origin = origins.get(element.dataset.index);
    if (!origin) return [];
    const at = positionIn(root, element);
    return [{ element, dx: origin.x - at.x, dy: origin.y - at.y }];
  });
}

/** Sets how far the gathered poem grows, and how long it waits for the words to land first. */
function growPoem(sheet: HTMLElement, poem: HTMLElement | null, afterMs: number) {
  const frame = poem?.parentElement;
  if (!poem || !frame) return;
  const grow = Math.max(1, Math.min(POEM_GROW, frame.clientHeight / Math.max(1, poem.offsetHeight)));
  sheet.style.setProperty("--poem-grow", String(grow));
  sheet.style.setProperty("--poem-grow-after", `${afterMs}ms`);
}

export function FoundPoem({ passage = PASSAGE, source = SOURCE, suggested = SUGGESTED }: { passage?: string; source?: string; suggested?: readonly number[] }) {
  const words = passage.split(/\s+/);
  const sheetRef = useRef<HTMLDivElement>(null);
  const passageRef = useRef<HTMLDivElement>(null);
  const poemRef = useRef<HTMLParagraphElement>(null);
  const [kept, setKept] = useState<ReadonlySet<number>>(() => new Set(suggested));
  const [mode, setMode] = useState<Mode>("passage");
  const [active, setActive] = useState(0);
  const [turn, setTurn] = useState<{ count: number; to: Mode }>({ count: 0, to: "passage" });
  const poem = keptPoem(words, kept);
  const running = useRef<Playback[]>([]);

  useEffect(() => () => running.current.forEach(playback => playback.cancel()), []);

  useLayoutEffect(() => {
    const root = sheetRef.current;
    if (!root || turn.count === 0) return;
    const passageWords = wordsOf(passageRef.current);
    const poemWords = wordsOf(poemRef.current);
    const erased = passageWords.filter(element => element.dataset.kept === undefined);
    const keptInPassage = passageWords.filter(element => element.dataset.kept !== undefined);
    const gathering = turn.to === "poem";
    const origins = drawnAt(root, gathering ? keptInPassage : poemWords);
    for (const playback of running.current) playback.cancel();
    const moves = gatherMoves(root, origins, gathering ? poemWords : keptInPassage);
    if (gathering) growPoem(root, poemRef.current, GATHER_DELAY_MS + Math.max(0, moves.length - 1) * GATHER_STAGGER_MS + MOTION.turnMs);
    running.current = gathering
      ? [play(erased, "recede", { staggerMs: 12 }), glide(moves, { delayMs: GATHER_DELAY_MS, staggerMs: GATHER_STAGGER_MS })]
      : [glide(moves, { staggerMs: GATHER_STAGGER_MS }), play(erased, "rise", { delayMs: 160, staggerMs: 12 })];
  }, [turn]);

  const switchTo = (next: Mode) => {
    setMode(next);
    setTurn(current => ({ count: current.count + 1, to: next }));
  };

  const open = (root: HTMLDivElement) => {
    const passageWords = wordsOf(root.querySelector("[data-passage]"));
    const keptWords = passageWords.filter(element => kept.has(Number(element.dataset.index)));
    const last = cascadeDelays(passageWords.length).at(-1) ?? 0;
    for (const element of keptWords) element.dataset.waiting = "";
    const timer = setTimeout(() => {
      for (const element of keptWords) delete element.dataset.waiting;
    }, last + 200);
    const playbacks = [play(passageWords, "rise"), play(Array.from(root.querySelectorAll("[data-after-words]")), "rise", { delayMs: last })];
    return () => {
      clearTimeout(timer);
      for (const element of keptWords) delete element.dataset.waiting;
      for (const playback of playbacks) playback.cancel();
    };
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = moveFocus(event.key, active, words.length);
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    passageRef.current?.querySelector<HTMLElement>(`[data-index="${next}"]`)?.focus();
  };

  return (
    <Stage className={styles.stage} onOpen={open}>
        <div ref={sheetRef} className={styles.sheet} data-mode={mode}>
          <div className={styles.text} data-reveal>
            <div
              ref={passageRef}
              className={`${stageStyles.display} ${styles.passage}`}
              role="toolbar"
              tabIndex={-1}
              aria-label="Passage. Choose the words to keep."
              data-passage
              inert={mode === "poem" || undefined}
              onKeyDown={onKeyDown}
            >
              {words.map((word, index) => (
                <span key={index}>
                  {index > 0 ? " " : null}
                  <button
                    type="button"
                    className={styles.word}
                    data-index={index}
                    data-kept={kept.has(index) || undefined}
                    aria-pressed={kept.has(index)}
                    tabIndex={index === active ? 0 : -1}
                    onFocus={() => setActive(index)}
                    onClick={() => setKept(current => toggle(current, index))}
                  >
                    {word}
                  </button>
                </span>
              ))}
            </div>
            <div className={styles.poemFrame} aria-hidden={mode === "passage" || undefined}>
              <p ref={poemRef} className={`${stageStyles.display} ${styles.poem}`}>
                {poem.map(({ index, text }, position) => (
                  <span key={index}>
                    {position > 0 ? " " : null}
                    <span className={stageStyles.word} data-index={index}>
                      {text}
                    </span>
                  </span>
                ))}
              </p>
            </div>
          </div>
          <p className={`${stageStyles.support} ${styles.source}`} data-after-words data-reveal>
            {source}
          </p>
        </div>
        <div className={styles.controls} data-after-words data-reveal>
          <button
            type="button"
            className={styles.primary}
            disabled={mode === "passage" && kept.size === 0}
            onClick={() => switchTo(mode === "passage" ? "poem" : "passage")}
          >
            {mode === "passage" ? "Erase the rest" : "Bring the words back"}
          </button>
          {mode === "passage" ? (
            <button type="button" className={styles.quiet} disabled={kept.size === 0} onClick={() => setKept(new Set())}>
              Clear
            </button>
          ) : null}
          <p className={`${stageStyles.support} ${styles.count}`} aria-live="polite">
            {kept.size === 1 ? "1 word kept" : `${kept.size} words kept`}
          </p>
        </div>
      </Stage>
  );
}
