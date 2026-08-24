import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { CheckIcon, CollapseIcon, CopyIcon, ExpandIcon, MoveIcon } from "./icons";
import { exportControlValues } from "./exportControlValues";
import { ProximityControl, type ShellControl } from "./ProximityControl";
import styles from "./ConfigurableShell.module.css";

const DEFAULT_BAR_COUNT = 39;
const COPIED_MS = 1600;
const SWIPE_DISTANCE = 28;
const SWIPE_VELOCITY = 0.32;
const TAP_DISTANCE = 10;

export type ShellAction = {
  id: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
};

export type ConfigurableShellProps = {
  children: ReactNode;
  actions?: readonly ShellAction[];
  controls?: readonly ShellControl[];
  barCount?: number;
  /**
   * Returns source for whatever is currently in the preview.
   * The shell copies this string; it has no knowledge of the preview component.
   */
  getExportCode?: () => string;
  onMove?: () => void;
  movePressed?: boolean;
  onExpand?: () => void;
  expandPressed?: boolean;
  expanded?: boolean;
  className?: string;
};

export type { ShellControl };
export type { ValueScale } from "./scales";
export { linearScale, logScale } from "./scales";
export { ProximityControl } from "./ProximityControl";
export { exportControlValues };

function IconSwap({
  state,
  a,
  b,
}: {
  state: "a" | "b";
  a: ReactNode;
  b: ReactNode;
}) {
  return (
    <span className={styles.iconSwap} data-state={state}>
      <span className={styles.icon} data-icon="a" aria-hidden="true">
        {a}
      </span>
      <span className={styles.icon} data-icon="b" aria-hidden="true">
        {b}
      </span>
    </span>
  );
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to execCommand.
  }

  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.left = "-9999px";
    document.body.append(el);
    el.select();
    const ok = document.execCommand("copy");
    el.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * Portable configurator card for Live experiments.
 * Pass preview children, actions, controls, and `getExportCode`.
 * Omit preview.tsx / ExamplePreview.* / exportExample.* when exporting.
 * Experimental view is a separate full-bleed workbench that only echoes this
 * look — never mount this component from Experimental chrome.
 */
export function ConfigurableShell({
  children,
  actions = [],
  controls = [],
  barCount = DEFAULT_BAR_COUNT,
  getExportCode,
  onMove,
  movePressed,
  onExpand,
  expandPressed,
  expanded,
  className,
}: ConfigurableShellProps) {
  const rootClass = className ? `${styles.root} ${className}` : styles.root;
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipHandleClick = useRef(false);
  const swipe = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startT: number;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  async function onCopy() {
    const code = getExportCode ? getExportCode() : exportControlValues(controls);
    const ok = await copyToClipboard(code);
    if (!ok) return;
    setCopied(true);
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }

  function onHandlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (!onExpand || event.button !== 0 || swipe.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    swipe.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startT: event.timeStamp,
    };
  }

  function onHandlePointerUp(event: PointerEvent<HTMLButtonElement>) {
    const gesture = swipe.current;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    swipe.current = null;

    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    const vy = dy / Math.max(event.timeStamp - gesture.startT, 1);
    const tap = Math.abs(dx) < TAP_DISTANCE && Math.abs(dy) < TAP_DISTANCE;
    const vertical = Math.abs(dy) >= Math.abs(dx);
    const expandSwipe = !expanded && vertical && (dy <= -SWIPE_DISTANCE || vy <= -SWIPE_VELOCITY);
    const collapseSwipe = expanded && vertical && (dy >= SWIPE_DISTANCE || vy >= SWIPE_VELOCITY);

    if (tap || expandSwipe || collapseSwipe) {
      skipHandleClick.current = true;
      onExpand?.();
    }
  }

  function onHandleClick() {
    if (skipHandleClick.current) {
      skipHandleClick.current = false;
      return;
    }
    onExpand?.();
  }

  return (
    <div className={styles.host}>
      <section
        className={rootClass}
        data-expanded={expanded ? "true" : undefined}
        aria-label="Component configurator"
      >
      <div
        className={styles.preview}
        data-panning={movePressed ? "true" : undefined}
      >
        <div className={styles.previewContent}>{children}</div>
        <div className={styles.frost} aria-hidden="true" />
        {(onMove || onExpand) && (
          <div className={styles.tools}>
            {onMove ? (
              <button
                type="button"
                className={styles.tool}
                aria-label="Pan preview"
                aria-pressed={movePressed}
                onClick={onMove}
              >
                <MoveIcon />
              </button>
            ) : (
              <span />
            )}
            {onExpand ? (
              <button
                type="button"
                className={styles.tool}
                aria-label={expandPressed ? "Exit expanded preview" : "Expand preview"}
                aria-pressed={expandPressed}
                onClick={onExpand}
              >
                <IconSwap
                  state={expandPressed ? "b" : "a"}
                  a={<ExpandIcon />}
                  b={<CollapseIcon />}
                />
              </button>
            ) : null}
          </div>
        )}
      </div>

      {onExpand ? (
        <button
          type="button"
          className={styles.handle}
          aria-label={expanded ? "Show controls" : "Expand preview"}
          aria-expanded={expanded}
          onPointerDown={onHandlePointerDown}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={() => {
            swipe.current = null;
          }}
          onClick={onHandleClick}
        >
          <span className={styles.handleBar} />
        </button>
      ) : null}

      <div className={styles.body} inert={expanded ? true : undefined} aria-hidden={expanded || undefined}>
        <div className={styles.bodyInner}>
          <div className={styles.actions}>
            {actions.map(action => (
              <button
                key={action.id}
                type="button"
                className={styles.action}
                onClick={action.onClick}
                disabled={action.disabled}
                aria-pressed={action.pressed}
              >
                {action.icon ? <span className={styles.actionIcon}>{action.icon}</span> : null}
                <span>{action.label}</span>
              </button>
            ))}
            <button
              type="button"
              className={styles.copy}
              aria-label={copied ? "Copied component" : "Copy component"}
              onClick={onCopy}
            >
              <IconSwap
                state={copied ? "b" : "a"}
                a={<CopyIcon />}
                b={<CheckIcon />}
              />
            </button>
          </div>

          {controls.length > 0 ? (
            <div className={styles.controls}>
              {controls.map(control => (
                <ProximityControl key={control.id} control={control} barCount={barCount} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
      </section>
    </div>
  );
}
