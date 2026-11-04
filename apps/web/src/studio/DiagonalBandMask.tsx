import { useRef, type RefObject } from "react";
import { opacity, useMotionStyle } from "../app/motion/hooks";
import type { MotionValue } from "../app/motion/motionValue";
import { frostStrength, liveLayerMask } from "./diagonalBand";
import styles from "./DiagonalBandMask.module.css";

/**
 * Styles for the Live layer during the Live↔Experimental dissolve.
 * Technique: posterize a geometric 45° luminance ramp into hard stripes
 * so the Live layer peels away in continuous diagonal bands (no square mosaic).
 *
 * Driven by a motion value: the gradient string only changes when a band
 * flips, so the DOM is written a dozen times per dissolve, not every frame.
 * At rest there is no mask at all, and a fully covered layer stops painting.
 */
export function useLiveLayerStyle(
  ref: RefObject<HTMLElement | null>,
  progress: MotionValue,
  reducedMotion: boolean,
) {
  return useMotionStyle(ref, [progress], style => {
    const p = progress.get();
    const mask = liveLayerMask(p, reducedMotion);
    style("maskImage", mask);
    style("WebkitMaskImage", mask);
    style("opacity", opacity(reducedMotion ? 1 - p : 1));
    style("visibility", p >= 1 ? "hidden" : "visible");
  });
}

/** Experimental sits fully under Live at rest; skip painting it there. */
export function useExperimentalLayerStyle(ref: RefObject<HTMLElement | null>, progress: MotionValue) {
  return useMotionStyle(ref, [progress], style => style("visibility", progress.get() <= 0 ? "hidden" : "visible"));
}

/**
 * Frost on the Experimental layer that peaks mid-dissolve. The blur radius
 * is fixed in CSS and only opacity moves, so the backdrop filter is not
 * rebuilt with a new kernel every frame.
 */
export function FrostOverlay({
  progress,
  disabled = false,
}: {
  progress: MotionValue;
  disabled?: boolean;
}) {
  if (disabled) return null;
  return <Frost progress={progress} />;
}

function Frost({ progress }: { progress: MotionValue }) {
  const ref = useRef<HTMLDivElement>(null);
  const style = useMotionStyle(ref, [progress], style => {
    const strength = frostStrength(progress.get());
    style("opacity", opacity(strength * 0.72));
    style("visibility", strength > 0.001 ? "visible" : "hidden");
  });
  return <div ref={ref} className={styles.frost} aria-hidden="true" style={style} />;
}
