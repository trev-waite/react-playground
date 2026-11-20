import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { cascadeDelays, glide, play, positionIn, type Move, type Playback } from "@/live/shared/Stage/choreography";
import { Stage } from "@/live/shared/Stage/Stage";
import stageStyles from "@/live/shared/Stage/Stage.module.css";
import { keptPoem, moveFocus, toggle } from "./poem";
import styles from "./FoundPoem.module.css";

/** Gandalf's answer to Frodo in The Fellowship of the Ring. */
const PASSAGE =
  "So do I, and so do all who live to see such times. But that is not for them to decide. All we have to decide is what to do with the time that is given us.";
const SOURCE = "Gandalf, The Fellowship of the Ring";

/** A poem already marked when the card opens, so there is something to erase: “all who live decide what to do with the time given us.” */
const SUGGESTED = [6, 7, 8, 25, 27, 28, 29, 30, 31, 32, 35, 36];

/** The erased words are well on their way out before the kept ones start to gather. */
const GATHER_DELAY_MS = 280;
const GATHER_STAGGER_MS = 24;

type Mode = "passage" | "poem";

function wordsOf(container: Element | null) {
  return container ? Array.from(container.querySelectorAll<HTMLElement>("[data-index]")) : [];
}

/** Each kept word glides from where its twin stands in the other layer. */
function gatherMoves(root: Element, from: HTMLElement[], to: HTMLElement[]): Move[] {
  const origins = new Map(from.map(element => [element.dataset.index, positionIn(root, element)]));
  return to.flatMap(element => {
    const origin = origins.get(element.dataset.index);
    if (!origin) return [];
    const at = positionIn(root, element);
    return [{ element, dx: origin.x - at.x, dy: origin.y - at.y }];
  });
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

  useLayoutEffect(() => {
    const root = sheetRef.current;
    if (!root || turn.count === 0) return;
    const passageWords = wordsOf(passageRef.current);
    const poemWords = wordsOf(poemRef.current);
    const erased = passageWords.filter(element => element.dataset.kept === undefined);
    const keptInPassage = passageWords.filter(element => element.dataset.kept !== undefined);
    const playbacks: Playback[] =
      turn.to === "poem"
        ? [play(erased, "recede", { staggerMs: 12 }), glide(gatherMoves(root, keptInPassage, poemWords), { delayMs: GATHER_DELAY_MS, staggerMs: GATHER_STAGGER_MS })]
        : [glide(gatherMoves(root, poemWords, keptInPassage), { staggerMs: GATHER_STAGGER_MS }), play(erased, "rise", { delayMs: 160, staggerMs: 12 })];
    return () => {
      for (const playback of playbacks) playback.cancel();
    };
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
          <div className={styles.text}>
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
