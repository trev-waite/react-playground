import { motion, useTransform, type MotionValue } from "motion/react";
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
export function useLiveLayerStyle(progress: MotionValue<number>, reducedMotion: boolean) {
  const mask = useTransform(progress, p => liveLayerMask(p, reducedMotion));
  const opacity = useTransform(progress, p => (reducedMotion ? 1 - p : 1));
  const visibility = useTransform(progress, p => (p >= 1 ? "hidden" : "visible"));
  return { maskImage: mask, WebkitMaskImage: mask, opacity, visibility };
}

/** Experimental sits fully under Live at rest; skip painting it there. */
export function useExperimentalLayerStyle(progress: MotionValue<number>) {
  const visibility = useTransform(progress, p => (p <= 0 ? "hidden" : "visible"));
  return { visibility };
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
  progress: MotionValue<number>;
  disabled?: boolean;
}) {
  const strength = useTransform(progress, frostStrength);
  const opacity = useTransform(strength, s => s * 0.72);
  const visibility = useTransform(strength, s => (s > 0.001 ? "visible" : "hidden"));
  if (disabled) return null;
  return <motion.div className={styles.frost} aria-hidden="true" style={{ opacity, visibility }} />;
}
