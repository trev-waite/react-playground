import type { CSSProperties } from "react";
import {
  BAND_EASE,
  DEFAULT_BAND_COUNT,
  DEFAULT_DURATION_MS,
  bandMaskGradient,
  frostStrength,
} from "./diagonalBand";
import styles from "./DiagonalBandMask.module.css";

export type DiagonalBandMaskProps = {
  /** 0 = Live covering; 1 = Experimental revealed */
  progress: number;
  bandCount?: number;
  durationMs?: number;
  /** Skip discrete bands; parent handles opacity crossfade */
  reducedMotion?: boolean;
  /** Skip frost overlay (prefers-reduced-transparency) */
  reducedTransparency?: boolean;
};

/**
 * Decorative mask helpers for the Live↔Experimental dissolve.
 * Technique: posterize a geometric 45° luminance ramp into hard stripes
 * so the Live layer peels away in continuous diagonal bands (no square mosaic).
 */
export function liveLayerMaskStyle(
  progress: number,
  options: {
    bandCount?: number;
    durationMs?: number;
    reducedMotion?: boolean;
  } = {},
): CSSProperties {
  const {
    bandCount = DEFAULT_BAND_COUNT,
    durationMs = DEFAULT_DURATION_MS,
    reducedMotion = false,
  } = options;

  if (reducedMotion) {
    return {
      opacity: progress >= 1 ? 0 : 1,
      transition: `opacity ${Math.min(durationMs, 180)}ms ease`,
      WebkitMaskImage: "none",
      maskImage: "none",
    };
  }

  const gradient = bandMaskGradient(progress, bandCount);
  return {
    WebkitMaskImage: gradient,
    maskImage: gradient,
    WebkitMaskSize: "100% 100%",
    maskSize: "100% 100%",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
  };
}

export function FrostOverlay({
  progress,
  reducedMotion = false,
  reducedTransparency = false,
}: {
  progress: number;
  reducedMotion?: boolean;
  reducedTransparency?: boolean;
}) {
  if (reducedMotion || reducedTransparency) return null;

  const strength = frostStrength(progress);
  if (strength <= 0.001) return null;

  return (
    <div
      className={styles.frost}
      aria-hidden="true"
      style={{
        opacity: strength * 0.72,
        backdropFilter: `blur(${strength * 8}px)`,
        WebkitBackdropFilter: `blur(${strength * 8}px)`,
        transition: `opacity 80ms ${BAND_EASE}`,
      }}
    />
  );
}
