import { useCallback, useId, useMemo, useRef, type KeyboardEvent, type PointerEvent } from "react";
import {
  applyStep,
  defaultFormat,
  proximityGain,
  resolvePosition,
  resolveValue,
  type ValueScale,
} from "./scales";
import styles from "./ProximityControl.module.css";

const DEFAULT_MIN = 0;
const DEFAULT_MAX = 100;
const MIN_BAR_SCALE = 0.12;
const SIGMA_RATIO = 0.085;

export type ShellControl = ValueScale & {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  barCount?: number;
  disabled?: boolean;
};

type ProximityControlProps = {
  control: ShellControl;
  barCount: number;
};

function scaleFromControl(control: ShellControl): ValueScale {
  return {
    min: control.min ?? DEFAULT_MIN,
    max: control.max ?? DEFAULT_MAX,
    step: control.step ?? 1,
    toValue: control.toValue,
    fromValue: control.fromValue,
    format: control.format,
  };
}

export function ProximityControl({ control, barCount }: ProximityControlProps) {
  const labelId = useId();
  const trackRef = useRef<HTMLDivElement>(null);
  const scale = scaleFromControl(control);
  const count = Math.max(3, control.barCount ?? barCount);
  const t = resolvePosition(control.value, scale);
  const display = (scale.format ?? ((v: number) => defaultFormat(v, scale.step)))(control.value);
  const sigma = Math.max(1.45, (count - 1) * SIGMA_RATIO);

  const bars = useMemo(() => {
    const last = count - 1;
    return Array.from({ length: count }, (_, i) => {
      const distance = Math.abs(i - t * last);
      const gain = proximityGain(distance, sigma);
      return MIN_BAR_SCALE + (1 - MIN_BAR_SCALE) * gain;
    });
  }, [count, sigma, t]);

  const setFromClientX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track || control.disabled) return;
      const rect = track.getBoundingClientRect();
      const nextT = rect.width === 0 ? 0 : (clientX - rect.left) / rect.width;
      control.onChange(resolveValue(nextT, scale));
    },
    [control, scale],
  );

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (control.disabled || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setFromClientX(event.clientX);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    setFromClientX(event.clientX);
  }

  function nudge(direction: -1 | 1, multiplier = 1) {
    if (control.disabled) return;
    const step = scale.step;
    if (step != null && step > 0) {
      control.onChange(applyStep(control.value + direction * step * multiplier, scale.min, scale.max, step));
      return;
    }
    control.onChange(resolveValue(t + direction * 0.01 * multiplier, scale));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        event.preventDefault();
        nudge(-1);
        break;
      case "ArrowRight":
      case "ArrowUp":
        event.preventDefault();
        nudge(1);
        break;
      case "PageDown":
        event.preventDefault();
        nudge(-1, 10);
        break;
      case "PageUp":
        event.preventDefault();
        nudge(1, 10);
        break;
      case "Home":
        event.preventDefault();
        control.onChange(resolveValue(0, scale));
        break;
      case "End":
        event.preventDefault();
        control.onChange(resolveValue(1, scale));
        break;
      default:
        break;
    }
  }

  return (
    <div className={styles.block} data-disabled={control.disabled ? "true" : undefined}>
      <div className={styles.label} id={labelId}>
        {control.label}
      </div>
      <div className={styles.trackWrap}>
        <div
          className={styles.badge}
          style={{ left: `${t * 100}%` }}
          aria-hidden="true"
        >
          {display}
        </div>
        <div
          ref={trackRef}
          className={styles.track}
          role="slider"
          tabIndex={control.disabled ? -1 : 0}
          aria-labelledby={labelId}
          aria-valuemin={scale.min}
          aria-valuemax={scale.max}
          aria-valuenow={control.value}
          aria-valuetext={display}
          aria-disabled={control.disabled || undefined}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onKeyDown={onKeyDown}
        >
          {bars.map((scaleY, i) => (
            <span
              key={i}
              className={styles.bar}
              style={{ transform: `scaleY(${scaleY})` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
