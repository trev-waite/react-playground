import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { glide, play, type Move, type Playback } from "@/live/kit/Stage/choreography";
import { Stage } from "@/live/kit/Stage/Stage";
import stageStyles from "@/live/kit/Stage/Stage.module.css";
import { changeWords, dayPart, splitWords, timeSentence, type Word } from "./timeWords";
import { bindWindHold } from "./windHold";
import styles from "./WordClock.module.css";

const MINUTE_MS = 60_000;
/** Old words leave quickly, and the new ones start rising as they go, so the two barely overlap even while the clock winds. */
const LEAVE_MS = 280;
const ARRIVE_AFTER_MS = 180;

type Run = { words: Word[]; removed: Word[] };

type Clock = {
  /** Minutes the reader has wound away from now. */
  offset: number;
  /** The real minute, as minutes since the epoch. */
  minute: number;
  /** Seconds into the real minute when it was last read. */
  second: number;
  sentence: Run;
  part: Run;
  nextId: number;
  version: number;
  wound: boolean;
};

function readNow() {
  const now = Date.now();
  return { minute: Math.floor(now / MINUTE_MS), second: (now % MINUTE_MS) / 1000 };
}

function textsAt(totalMinutes: number) {
  const date = new Date(totalMinutes * MINUTE_MS);
  const hour = date.getHours();
  const minute = date.getMinutes();
  return { sentence: splitWords(timeSentence(hour, minute)), part: splitWords(dayPart(hour, minute)) };
}

function settle(previous: Clock | null, minute: number, second: number, offset: number, wound: boolean): Clock {
  const texts = textsAt(minute + offset);
  const sentence = changeWords(previous?.sentence.words ?? [], texts.sentence, previous?.nextId ?? 0);
  const part = changeWords(previous?.part.words ?? [], texts.part, sentence.nextId);
  return {
    offset,
    minute,
    second,
    sentence: { words: sentence.words, removed: sentence.removed },
    part: { words: part.words, removed: part.removed },
    nextId: part.nextId,
    version: (previous?.version ?? 0) + 1,
    wound,
  };
}

/** Calls `tick` just after each minute turns on the wall clock. */
function everyMinute(tick: () => void): () => void {
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    // perf-allow: one update a minute, on the wall clock's minute, so the time is right whenever the card is seen.
    timer = setTimeout(() => {
      tick();
      schedule();
    }, MINUTE_MS - (Date.now() % MINUTE_MS) + 20);
  };
  schedule();
  return () => clearTimeout(timer);
}

function initialClock(): Clock {
  const { minute, second } = readNow();
  return settle(null, minute, second, 0, false);
}

/** Where an element is drawn now relative to its layout box, so a glide cut short by the next one starts from there, not from its last layout. */
function offsetOf(element: HTMLElement): { x: number; y: number } {
  if (element.getAnimations().length === 0) return { x: 0, y: 0 };
  const transform = getComputedStyle(element).transform;
  if (!transform || transform === "none") return { x: 0, y: 0 };
  const matrix = new DOMMatrixReadOnly(transform);
  return { x: matrix.m41, y: matrix.m42 };
}

/** Moves words that stayed, raises words that arrived, and lets removed words fade where they stood. */
function WordRun({ run, version }: { run: Run; version: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const places = useRef(new Map<number, { x: number; y: number }>());
  const laidOut = useRef(false);
  const gliding = useRef<Playback | null>(null);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const first = !laidOut.current;
    laidOut.current = true;
    const next = new Map<number, { x: number; y: number }>();
    const moves: Move[] = [];
    const entering: Element[] = [];
    for (const element of Array.from(root.querySelectorAll<HTMLElement>("[data-id]"))) {
      const id = Number(element.dataset.id);
      const at = { x: element.offsetLeft, y: element.offsetTop };
      next.set(id, at);
      const was = places.current.get(id);
      if (!was) {
        entering.push(element);
        continue;
      }
      const still = offsetOf(element);
      const dx = was.x - at.x + still.x;
      const dy = was.y - at.y + still.y;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) moves.push({ element, dx, dy });
    }
    const leaving: Element[] = [];
    for (const ghost of Array.from(root.querySelectorAll<HTMLElement>("[data-ghost]"))) {
      const was = places.current.get(Number(ghost.dataset.ghost));
      if (!was) continue;
      ghost.style.left = `${was.x}px`;
      ghost.style.top = `${was.y}px`;
      leaving.push(ghost);
    }
    places.current = next;
    if (first) return;
    play(leaving, "recede", { durationMs: LEAVE_MS, staggerMs: 0 });
    gliding.current?.cancel();
    gliding.current = glide(moves);
    play(entering, "rise", { delayMs: leaving.length ? ARRIVE_AFTER_MS : 0 });
  }, [version]);

  return (
    <span ref={ref} className={styles.run} aria-hidden="true">
      {run.words.map((word, index) => (
        <span key={word.id}>
          {index > 0 ? " " : null}
          <span className={stageStyles.word} data-id={word.id} data-word>
            {word.text}
          </span>
        </span>
      ))}
      {run.removed.map(word => (
        <span key={`ghost-${word.id}`} className={`${stageStyles.word} ${styles.ghost}`} data-ghost={word.id}>
          {word.text}
        </span>
      ))}
    </span>
  );
}

export function WordClock() {
  const [clock, setClock] = useState(initialClock);
  const earlierRef = useRef<HTMLButtonElement>(null);
  const laterRef = useRef<HTMLButtonElement>(null);

  useEffect(
    () =>
      everyMinute(() => {
        const { minute, second } = readNow();
        setClock(previous => (previous.minute === minute ? previous : settle(previous, minute, second, previous.offset, previous.wound)));
      }),
    [],
  );

  useEffect(() => {
    const wind = (minutes: number) => setClock(previous => settle(previous, previous.minute, previous.second, previous.offset + minutes, true));
    const earlier = earlierRef.current;
    const later = laterRef.current;
    if (!earlier || !later) return;
    const unbind = [bindWindHold(earlier, () => wind(-1)), bindWindHold(later, () => wind(1))];
    return () => {
      for (const release of unbind) release();
    };
  }, []);

  const open = (root: HTMLDivElement) => {
    const playbacks: Playback[] = [
      play(Array.from(root.querySelectorAll("[data-word]")), "rise"),
      play(Array.from(root.querySelectorAll("[data-after-words]")), "rise", { delayMs: 480 }),
    ];
    return () => {
      for (const playback of playbacks) playback.cancel();
    };
  };

  const spoken = [clock.sentence.words, clock.part.words].map(run => run.map(word => word.text).join(" ")).join(" ");

  return (
    <Stage className={styles.stage} onOpen={open}>
      <div className={styles.face}>
        <p className={stageStyles.srOnly} aria-live={clock.wound ? "polite" : "off"}>
          {spoken}
        </p>
        <p className={`${stageStyles.display} ${styles.sentence}`} data-reveal>
          <WordRun run={clock.sentence} version={clock.version} />
        </p>
        <p className={`${stageStyles.support} ${styles.part}`} data-reveal>
          <WordRun run={clock.part} version={clock.version} />
        </p>
        <div className={styles.minute} data-after-words data-reveal aria-hidden="true">
          <span
            key={clock.minute}
            className={styles.minuteFill}
            style={{ "--second": clock.second } as CSSProperties}
          />
        </div>
        <div className={styles.controls} data-after-words data-reveal>
          <button ref={earlierRef} type="button" className={styles.wind} aria-label="One minute earlier">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M10 3.5 5.5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            className={styles.now}
            data-hidden={clock.offset === 0 || undefined}
            disabled={clock.offset === 0}
            onClick={() => {
              setClock(previous => settle(previous, previous.minute, previous.second, 0, true));
              laterRef.current?.focus();
            }}
          >
            Now
          </button>
          <button ref={laterRef} type="button" className={styles.wind} aria-label="One minute later">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </Stage>
  );
}
