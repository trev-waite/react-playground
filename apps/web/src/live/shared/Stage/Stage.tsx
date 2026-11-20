import { useEffectEvent, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { MOTION, prefersReducedMotion } from "./choreography";
import stageStyles from "./Stage.module.css";

/** Share of the stage that must be on screen before it opens, so an opening is seen rather than spent while the card is still arriving. */
const OPEN_THRESHOLD = 0.4;

const MOTION_VARIABLES = {
  "--stage-turn": `${MOTION.turnMs}ms`,
  "--stage-spring-ease": MOTION.springEase,
  "--stage-fade-ease": MOTION.fadeEase,
} as CSSProperties;

/** Opens `root` once it is mostly on screen, or at once under reduced motion. Returns a cleanup that also undoes the opening's own. */
function watchOpening(root: HTMLDivElement, open: () => (() => void) | void): () => void {
  let cleanup: (() => void) | void;
  const start = () => {
    root.dataset.open = "";
    cleanup = open();
  };
  if (prefersReducedMotion()) {
    start();
    return () => cleanup?.();
  }
  const observer = new IntersectionObserver(
    entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      start();
    },
    { threshold: OPEN_THRESHOLD },
  );
  observer.observe(root);
  return () => {
    observer.disconnect();
    cleanup?.();
  };
}

type StageProps = {
  /** Accessible name for the whole piece, when it is a picture or a group rather than plain content. */
  label?: string;
  role?: "img" | "group" | "region";
  className?: string;
  /**
   * Runs once, the first time the stage is mostly on screen (at once under
   * reduced motion). Play the opening here with `play` from the choreography;
   * return a cleanup that cancels it.
   */
  onOpen?: (root: HTMLDivElement) => (() => void) | void;
  children: ReactNode;
};

/**
 * The frame every Stage component opens in: ink, paper, and one blue accent
 * that follow the color scheme, a serif display face beside the UI face, and
 * a single opening that waits until the reader can see it. Anything marked
 * `data-reveal` stays hidden until then.
 */
export function Stage({ label, role, className, onOpen, children }: StageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const open = useEffectEvent((root: HTMLDivElement) => onOpen?.(root));

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    return watchOpening(root, () => open(root));
  }, []);

  return (
    <div
      ref={ref}
      className={className ? `${stageStyles.root} ${className}` : stageStyles.root}
      style={MOTION_VARIABLES}
      role={role}
      aria-label={label}
    >
      {children}
    </div>
  );
}

/** Text read whole by assistive tech and shown as words a cascade can move, each `[data-word]`. */
export function Words({ text }: { text: string }) {
  return (
    <>
      <span className={stageStyles.srOnly}>{text}</span>
      <span aria-hidden="true">
        {text.split(/\s+/).map((word, index) => (
          <span key={index}>
            {index > 0 ? " " : null}
            <span className={stageStyles.word} data-word={index}>
              {word}
            </span>
          </span>
        ))}
      </span>
    </>
  );
}
