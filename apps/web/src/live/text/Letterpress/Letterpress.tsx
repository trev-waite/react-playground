import { useId, useLayoutEffect, useRef } from "react";
import { connectLetterpress } from "./interaction";
import { LETTERS } from "./scene";
import styles from "./Letterpress.module.css";

export type LetterpressProps = {
  /** Set to 0–1 to drive the scene from a parent's scroll timeline. */
  progress?: number;
};

export function Letterpress({ progress }: LetterpressProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const seek = useRef<((progress: number) => void) | null>(null);
  const gestureHelpId = useId();
  const controlled = progress !== undefined;

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const scene = connectLetterpress(stage, controlled ? null : scrollRef.current, sliderRef.current);
    seek.current = scene.seek;
    return () => {
      seek.current = null;
      scene.dispose();
    };
  }, [controlled]);

  useLayoutEffect(() => {
    if (progress !== undefined) seek.current?.(progress);
  }, [progress]);

  return (
    <div className={styles.scene}>
      <div className={styles.scrollport} ref={scrollRef} data-scroll-scene={!controlled || undefined}>
        <div className={styles.stage} ref={stageRef} data-letterpress>
          <div className={styles.field}>
            <svg className={styles.plate} data-pile-plate viewBox="0 0 360 46" aria-hidden="true">
              <path className={styles.plateFront} d="M1 35h300v9H1z" />
              <path className={styles.plateSide} d="m301 35 58-33v9l-58 33z" />
              <path className={styles.plateFace} d="M1 35 59 2h300l-58 33z" />
            </svg>
            <span className={styles.srOnly}>Take shape.</span>
            <span className={styles.srOnly} id={gestureHelpId}>
              Use the left and right arrows to select a letter. Press Space to lift it, Space again to place it, or Escape to cancel.
            </span>
            <div className={styles.letters} data-letters role="group" aria-label="Move individual letters" aria-describedby={gestureHelpId}>
              {LETTERS.map(({ glyph }, index) => (
                <button
                  className={styles.letter}
                  key={index}
                  data-letter={index}
                  type="button"
                  tabIndex={index === 0 ? 0 : -1}
                  aria-label={glyph === "." ? "Period" : `Letter ${glyph}`}
                  aria-pressed={false}
                >
                  <span className={styles.glyph}>
                    <span className={styles.baseline} aria-hidden="true">
                      <svg className={styles.art} data-glyph-art>
                        <path />
                        <path />
                      </svg>
                    </span>{glyph}
                  </span>
                </button>
              ))}
            </div>
          </div>
          {!controlled && (
            <div className={styles.controls}>
              <button className={styles.playback} data-playback type="button" aria-label="Play animation">
                <svg className={styles.playbackIcon} data-icon="play" viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M7 4.5v11l9-5.5z" fill="currentColor" />
                </svg>
                <svg className={styles.playbackIcon} data-icon="pause" viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M7 5v10m6-10v10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <svg className={styles.playbackIcon} data-icon="replay" viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M4 5v4h4M4.5 9a6 6 0 1 1 .7 4.4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <div
                ref={sliderRef}
                className={styles.scrubber}
                role="slider"
                tabIndex={0}
                aria-label="Scroll to assemble"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={0}
              >
                <span className={styles.track} data-scrubber-track aria-hidden="true">
                  <span className={styles.thumb} data-scrubber-thumb />
                </span>
              </div>
              <span className={styles.hint} aria-hidden="true">
                <span className={styles.pointerHint} data-compact-hint>Drag a letter</span>
                <span className={styles.touchHint} data-compact-hint>Hold to drag</span>
              </span>
            </div>
          )}
        </div>
        {!controlled && <div className={styles.travel} aria-hidden="true" />}
      </div>
    </div>
  );
}
