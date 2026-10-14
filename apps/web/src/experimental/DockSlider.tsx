import { useId, useLayoutEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";
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
  valueBar,
  valueHeadLayout,
  type Spring,
  type Zone,
} from "./dockSliderGeometry";
import styles from "./DockSlider.module.css";

const TRACK_HEIGHT = 32;
const POINTER_IDLE_MS = 700;
const KEYBOARD_IDLE_MS = 900;

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
  const valueClipId = useId();
  const sliderRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const barsRef = useRef<SVGPathElement>(null);
  const labelRef = useRef<SVGTextElement>(null);
  const valueRef = useRef<SVGTextElement>(null);
  const valueClipRef = useRef<SVGPathElement>(null);
  const pointerRef = useRef<number | null>(null);
  const pointerXRef = useRef(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);
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
  const latestRef = useRef({ position, display, disabled: control.disabled });

  useLayoutEffect(() => {
    latestRef.current = { position, display, disabled: control.disabled };
    if (control.disabled) {
      activeRef.current = false;
      const pointerId = pointerRef.current;
      pointerRef.current = null;
      if (pointerId !== null && sliderRef.current?.hasPointerCapture(pointerId)) {
        sliderRef.current.releasePointerCapture(pointerId);
      }
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    wakeRef.current?.();
  }, [position, display, control.disabled]);

  useLayoutEffect(() => {
    const slider = sliderRef.current;
    const svg = svgRef.current;
    const barsPath = barsRef.current;
    const label = labelRef.current;
    const valueText = valueRef.current;
    const valueClip = valueClipRef.current;
    if (!slider || !svg || !barsPath || !label || !valueText || !valueClip) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const textContext = document.createElement("canvas").getContext("2d");
    const form = spring(0);
    const bars: LiquidBar[] = [];
    let width = 0;
    let radius = 1.5;
    let zone: Zone = { left: 0, right: 0, bottom: 0, top: 0 };
    let frame = 0;
    let lastTime = 0;
    let disposed = false;
    let measuredDisplay = "";
    let valueWidth = 20;
    let valueBaselineOffset = 0;
    let valueGlyphHeight = 0;
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
          left: metrics.actualBoundingBoxLeft,
          right: metrics.actualBoundingBoxRight,
          ascent: metrics.actualBoundingBoxAscent,
          descent: metrics.actualBoundingBoxDescent,
        };
      }
      const bounds = text.getBBox();
      const x = Number(text.getAttribute("x") ?? 0);
      const baseline = Number(text.getAttribute("y") ?? 0);
      return {
        left: x - bounds.x,
        right: bounds.x + bounds.width - x,
        ascent: baseline - bounds.y,
        descent: bounds.y + bounds.height - baseline,
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
      let valuePath = "";

      if (measuredDisplay !== latestRef.current.display) {
        measuredDisplay = latestRef.current.display;
        valueWidth = Math.min(width, valueText.getComputedTextLength() + 14);
        const metrics = measureGlyphs(valueText);
        valueBaselineOffset = (metrics.ascent - metrics.descent) / 2;
        valueGlyphHeight = metrics.ascent + metrics.descent;
      }
      const active = activeRef.current && !latestRef.current.disabled;
      moving = advance(form, active ? 1 : 0, 380, 0.76, dt) || moving;
      const peakIndex = Math.round(latestRef.current.position * lastBar);
      const peakX = centerAt(latestRef.current.position * lastBar);
      const stemX = centerAt(peakIndex);
      const peakTop = heightAt(peakIndex);
      const amount = clamp(form.value, 0, 1.04);
      const headWidth = Math.min(width, 2 * radius + (valueWidth - 2 * radius) * amount);
      const valueX = clamp(
        stemX + (peakX - stemX) * Math.min(1, amount), headWidth / 2, width - headWidth / 2,
      );
      const maxHeadHeight = Math.max(2 * radius, Math.min(16, peakTop - zone.top));
      const valueLayout = valueHeadLayout(peakTop, radius, amount, maxHeadHeight);

      for (let i = 0; i < count; i++) {
        const cx = centerAt(i);
        const height = heightAt(i);
        const overLabel = overlapsZone(cx, radius, zone);
        const targets = overLabel
          ? barTargets(height, zone)
          : { lower: height, gapTop: height, top: height };
        const bar = bars[i]!;
        const splitting = targets.gapTop > targets.lower;
        if (overLabel) {
          moving = advance(bar.lower, targets.lower, 850, 0.9, dt) || moving;
          moving = advance(bar.gapTop, targets.gapTop, splitting ? 420 : 520, 0.76, dt) || moving;
          moving = advance(bar.top, targets.top, splitting ? 600 : 300, 0.8, dt) || moving;
        } else {
          bar.lower.value = bar.gapTop.value = bar.top.value = height;
          bar.lower.velocity = bar.gapTop.velocity = bar.top.velocity = 0;
        }

        if (i === peakIndex) {
          if (overLabel) path += capsule(cx, 0, zone.bottom, radius, TRACK_HEIGHT);
          valuePath = valueBar({
            stemX,
            bottom: overLabel ? zone.top : 0,
            top: peakTop,
            radius,
            headX: valueX,
            headWidth,
            headHeight: valueLayout.height,
            trackHeight: TRACK_HEIGHT,
          });
          path += valuePath;
          continue;
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
      if (amount > 0.002) {
        const headHeight = valueLayout.height;
        const center = valueLayout.center;
        valueClip.setAttribute("d", valuePath);
        valueText.setAttribute("x", String(valueX));
        valueText.setAttribute("y", String(TRACK_HEIGHT - center + valueBaselineOffset));
        valueText.setAttribute("opacity", String(clamp(
          (headHeight - valueGlyphHeight) / Math.max(1, maxHeadHeight - valueGlyphHeight), 0, 1,
        )));
      } else {
        valueClip.setAttribute("d", "");
        valueText.setAttribute("opacity", "0");
      }
      barsPath.setAttribute("d", path);
      slider.toggleAttribute("data-active", active || amount > 0.002);
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
      label.textContent = control.label;
      if (label.getComputedTextLength() > width - 4) {
        let shortened = control.label;
        do {
          shortened = shortened.slice(0, -1);
          label.textContent = `${shortened}…`;
        } while (shortened && label.getComputedTextLength() > width - 4);
      }
      const metrics = measureGlyphs(label);
      const labelBaseline = TRACK_HEIGHT / 2 + (metrics.ascent - metrics.descent) / 2;
      label.setAttribute("y", String(labelBaseline));
      zone = {
        left: -metrics.left - 2,
        right: metrics.right + 2,
        bottom: TRACK_HEIGHT - labelBaseline - metrics.descent - 1.5,
        top: TRACK_HEIGHT - labelBaseline + metrics.ascent + 1.5,
      };
      measuredDisplay = "";
      if (!bars.length) {
        for (let i = 0; i < count; i++) {
          const height = heightAt(i);
          const targets = overlapsZone(centerAt(i), radius, zone)
            ? barTargets(height, zone)
            : { lower: height, gapTop: height, top: height };
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
    };
  }, [count, control.label]);

  useLayoutEffect(() => () => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
  }, []);

  function hideValue() {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;
    activeRef.current = false;
    wakeRef.current?.();
  }

  function showValue(duration: number) {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    activeRef.current = true;
    idleTimerRef.current = setTimeout(hideValue, duration);
    wakeRef.current?.();
  }

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
    showValue(POINTER_IDLE_MS);
    setFromClientX(event.clientX);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (pointerRef.current !== event.pointerId || pointerXRef.current === event.clientX) return;
    pointerXRef.current = event.clientX;
    showValue(POINTER_IDLE_MS);
    setFromClientX(event.clientX);
  }

  function endPointer(event: PointerEvent<HTMLDivElement>) {
    if (pointerRef.current !== event.pointerId) return;
    pointerRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    hideValue();
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
    showValue(KEYBOARD_IDLE_MS);
    control.onChange(nextValue);
  }

  return (
    <div
      ref={sliderRef}
      className={styles.block}
      data-disabled={control.disabled ? "true" : undefined}
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
      onBlur={event => {
        event.currentTarget.removeAttribute("data-pointer-focus");
        hideValue();
      }}
    >
      <svg ref={svgRef} className={styles.track} aria-hidden="true">
        <path ref={barsRef} className={styles.ink} />
        <text ref={labelRef} className={styles.label} x="0" y={TRACK_HEIGHT / 2}>{control.label}</text>
        <text ref={valueRef} className={styles.value} clipPath={`url(#${valueClipId})`} opacity="0">{display}</text>
        <defs>
          <clipPath id={valueClipId} clipPathUnits="userSpaceOnUse">
            <path ref={valueClipRef} />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}
