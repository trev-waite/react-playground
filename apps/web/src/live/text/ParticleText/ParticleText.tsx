import { useEffect, useRef } from "react";
import { ParticleField } from "./particleField";
import styles from "./ParticleText.module.css";

type ParticleTextProps = {
  children: string;
  /** A small patch near the first letter keeps shimmering to hint that the text is touchable. */
  idleHint?: boolean;
  className?: string;
};

export function ParticleText({ children, idleHint = true, className }: ParticleTextProps) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const text = textRef.current;
    const canvas = canvasRef.current;
    if (!root || !text || !canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const field = new ParticleField({ root, text, canvas }, idleHint);
    return () => field.dispose();
  }, [children, idleHint]);

  return (
    <span ref={rootRef} className={className ? `${styles.root} ${className}` : styles.root}>
      <span ref={textRef} className={styles.text}>
        {children}
      </span>
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
    </span>
  );
}
