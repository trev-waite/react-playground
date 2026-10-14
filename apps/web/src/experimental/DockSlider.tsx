import { useLayoutEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";
import type { ShellControl } from "../live/shells/ConfigurableShell/ProximityControl";
import {
  applyStep,
  defaultFormat,
  proximityGain,
  resolvePosition,
  resolveValue,
  type ValueScale,
} from "../live/shells/ConfigurableShell/scales";
import {
  barTargets,
  capsule,
  isSettled,
  neck,
  neckWaist,
  overlapsZone,
  spring,
  stepSpring,
  stillConnected,
  type Spring,
  type Zone,
} from "./dockSliderGeometry";
import styles from "./DockSlider.module.css";

const TRACK_HEIGHT = 32;

type DockSliderProps = {
  control: ShellControl;
  barCount?: number;
};

type LiquidBar = {
  lower: Spring;
  gapTop: Spring;
  top: Spring;
  connected: boolean;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function DockSlider({ control, barCount = 29 }: DockSliderProps) {
  const sliderRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const barsRef = useRef<SVGPathElement>(null);
  const valueRef = useRef<SVGTextElement>(null);
  const pointerRef = useRef<number | null>(null);
  const pointerXRef = useRef(0);
  const measureRef = useRef<(() => void) | null>(null);
  const wakeRef = useRef<(() => void) | null>(null);

  const scale: ValueScale = {
    min: control.min ?? 0,
    max: control.max ?? 100,
    step: control.step ?? 1,
    toValue: control.toValue,
    fromValue: control.fromValue,
    format: control.format,
  };
  const position = resolvePosition(control.value, scale);
  const display = (scale.format ?? ((value: number) => defaultFormat(value, scale.step)))(control.value);
  const count = Math.max(3, Math.round(control.barCount ?? barCount));
  const latestRef = useRef({ position, display });

  useLayoutEffect(() => {
    const displayChanged = latestRef.current.display !== display;
    latestRef.current = { position, display };
    if (control.disabled) {
      const pointerId = pointerRef.current;
      pointerRef.current = null;
      if (pointerId !== null && sliderRef.current?.hasPointerCapture(pointerId)) {
        sliderRef.current.releasePointerCapture(pointerId);
      }
    }
    if (displayChanged) measureRef.current?.();
    else wakeRef.current?.();
  }, [position, display, control.disabled]);

  useLayoutEffect(() => {
    const svg = svgRef.current;
    const barsPath = barsRef.current;
    const valueText = valueRef.current;
    if (!svg || !barsPath || !valueText) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const textContext = document.createElement("canvas").getContext("2d");
    const bars: LiquidBar[] = [];
    let width = 0;
    let radius = 1.5;
    let valueZone: Zone | undefined;
    let frame = 0;
    let lastTime = 0;
    let disposed = false;
    const lastBar = count - 1;
    const sigma = Math.max(1.45, lastBar * 0.085);
    const centerAt = (index: number) => radius + index * (width - 2 * radius) / lastBar;
    const heightAt = (index: number) => TRACK_HEIGHT * (
      0.12 + 0.88 * proximityGain(Math.abs(index - latestRef.current.position * lastBar), sigma)
    );

    const measureGlyphs = (text: SVGTextElement) => {
      if (textContext) {
        const font = getComputedStyle(text);
        textContext.font = `${font.fontWeight} ${font.fontSize} ${font.fontFamily}`;
        textContext.letterSpacing = font.letterSpacing;
        const metrics = textContext.measureText(text.textContent ?? "");
        return {
          ascent: metrics.actualBoundingBoxAscent,
          descent: metrics.actualBoundingBoxDescent,
        };
      }
      const bounds = text.getBBox();
      const baseline = Number(text.getAttribute("y") ?? 0);
      return {
        ascent: baseline - bounds.y,
        descent: bounds.y + bounds.height - baseline,
      };
    };

    const measureZone = (text: SVGTextElement, x: number): Zone => {
      const metrics = measureGlyphs(text);
      const baseline = TRACK_HEIGHT / 2 + (metrics.ascent - metrics.descent) / 2;
      text.setAttribute("x", String(x));
      text.setAttribute("y", String(baseline));
      const bounds = text.getBBox();
      return {
        left: bounds.x - 2,
        right: bounds.x + bounds.width + 2,
        bottom: TRACK_HEIGHT - baseline - metrics.descent - 1.5,
        top: TRACK_HEIGHT - baseline + metrics.ascent + 1.5,
      };
    };

    function advance(state: Spring, target: number, stiffness: number, damping: number, dt: number) {
      if (motion.matches || isSettled(state, target)) {
        state.value = target;
        state.velocity = 0;
        return false;
      }
      stepSpring(state, target, stiffness, damping, dt);
      return true;
    }

    const draw = (now: number) => {
      frame = 0;
      if (!width || disposed) return;
      const dt = lastTime ? clamp((now - lastTime) / 1000, 0, 0.048) : 1 / 60;
      lastTime = now;
      let moving = false;
      let path = "";

      for (let i = 0; i < count; i++) {
        const cx = centerAt(i);
        const height = heightAt(i);
        const zone = valueZone && overlapsZone(cx, radius, valueZone) ? valueZone : undefined;
        const targets = barTargets(height, zone);
        const bar = bars[i]!;
        const splitting = targets.gapTop > targets.lower;
        if (zone) {
          moving = advance(bar.lower, targets.lower, 850, 0.9, dt) || moving;
          moving = advance(bar.gapTop, targets.gapTop, splitting ? 420 : 520, 0.76, dt) || moving;
          moving = advance(bar.top, targets.top, splitting ? 600 : 300, 0.8, dt) || moving;
        } else {
          bar.lower.value = bar.gapTop.value = bar.top.value = height;
          bar.lower.velocity = bar.gapTop.velocity = bar.top.velocity = 0;
        }

        const lower = Math.max(0, bar.lower.value);
        const upperBottom = Math.max(0, bar.gapTop.value);
        const top = Math.max(lower, bar.top.value);
        const upperRadius = Math.min(radius, Math.max(0, top - upperBottom) / 2);
        path += capsule(cx, 0, lower, radius, TRACK_HEIGHT);
        path += capsule(cx, upperBottom, top, radius, TRACK_HEIGHT);
        const gap = upperBottom - lower;
        bar.connected = upperRadius > 0.025 ? stillConnected(bar.connected, gap) : true;
        if (bar.connected && upperRadius > 0.025) {
          const lowerRadius = Math.min(radius, lower / 2);
          path += neck(
            { x: cx, y: lower - lowerRadius, radius: lowerRadius },
            { x: cx, y: upperBottom + upperRadius, radius: upperRadius },
            neckWaist(gap, Math.min(lowerRadius, upperRadius)),
            TRACK_HEIGHT,
          );
        }
      }
      barsPath.setAttribute("d", path);
      if (moving) frame = requestAnimationFrame(draw);
      else lastTime = 0;
    };

    function wake() {
      if (!frame && !disposed) frame = requestAnimationFrame(draw);
    }

    const measure = () => {
      width = svg.getBoundingClientRect().width;
      if (!width) return;
      radius = Math.min(1.5, width / (count * 3));
      svg.setAttribute("viewBox", `0 0 ${width} ${TRACK_HEIGHT}`);
      valueZone = measureZone(valueText, width);
      if (!bars.length) {
        for (let i = 0; i < count; i++) {
          const height = heightAt(i);
          const zone = overlapsZone(centerAt(i), radius, valueZone) ? valueZone : undefined;
          const targets = barTargets(height, zone);
          bars.push({
            lower: spring(targets.lower),
            gapTop: spring(targets.gapTop),
            top: spring(targets.top),
            connected: targets.gapTop === targets.lower,
          });
        }
      }
      wake();
    };

    wakeRef.current = wake;
    measureRef.current = measure;
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    motion.addEventListener("change", wake);
    void document.fonts.ready.then(() => { if (!disposed) measure(); });
    measure();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      motion.removeEventListener("change", wake);
      wakeRef.current = null;
      measureRef.current = null;
    };
  }, [count]);

  function setFromClientX(clientX: number) {
    const svg = svgRef.current;
    if (!svg || control.disabled) return;
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return;
    control.onChange(resolveValue((clientX - rect.left) / rect.width, scale));
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (control.disabled || event.button !== 0 || pointerRef.current !== null) return;
    pointerRef.current = event.pointerId;
    pointerXRef.current = event.clientX;
    event.currentTarget.setAttribute("data-pointer-focus", "");
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    setFromClientX(event.clientX);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (pointerRef.current !== event.pointerId || pointerXRef.current === event.clientX) return;
    pointerXRef.current = event.clientX;
    setFromClientX(event.clientX);
  }

  function endPointer(event: PointerEvent<HTMLDivElement>) {
    if (pointerRef.current !== event.pointerId) return;
    pointerRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (control.disabled) return;
    event.currentTarget.removeAttribute("data-pointer-focus");
    let direction: -1 | 1 = 1;
    let multiplier = 1;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        direction = -1;
        break;
      case "PageDown":
        direction = -1;
        multiplier = 10;
        break;
      case "PageUp":
        multiplier = 10;
        break;
      case "ArrowRight":
      case "ArrowUp":
      case "Home":
      case "End":
        break;
      default:
        return;
    }
    event.preventDefault();
    const nextValue = event.key === "Home" || event.key === "End"
      ? resolveValue(event.key === "Home" ? 0 : 1, scale)
      : scale.step != null && scale.step > 0
        ? applyStep(control.value + direction * scale.step * multiplier, scale.min, scale.max, scale.step)
        : resolveValue(position + direction * 0.01 * multiplier, scale);
    control.onChange(nextValue);
  }

  return (
    <div className={styles.control} data-disabled={control.disabled ? "true" : undefined}>
      <span className={styles.label} aria-hidden="true">{control.label}</span>
      <div
        ref={sliderRef}
        className={styles.block}
        role="slider"
        tabIndex={control.disabled ? -1 : 0}
        aria-label={control.label}
        aria-orientation="horizontal"
        aria-valuemin={scale.min}
        aria-valuemax={scale.max}
        aria-valuenow={control.value}
        aria-valuetext={display}
        aria-disabled={control.disabled || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onLostPointerCapture={endPointer}
        onKeyDown={onKeyDown}
        onBlur={event => event.currentTarget.removeAttribute("data-pointer-focus")}
      >
        <svg ref={svgRef} className={styles.track} aria-hidden="true">
          <path ref={barsRef} className={styles.ink} />
          <text ref={valueRef} className={styles.value} x="0" y={TRACK_HEIGHT / 2}>{display}</text>
        </svg>
      </div>
    </div>
  );
}
