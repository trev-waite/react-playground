import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckIcon, CopyIcon, ExpandIcon, MoveIcon } from "./icons";
import { exportControlValues } from "./exportControlValues";
import { ProximityControl, type ShellControl } from "./ProximityControl";
import styles from "./ConfigurableShell.module.css";

const DEFAULT_BAR_COUNT = 39;
const COPIED_MS = 1600;

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
 * Portable configurator. Pass preview children, actions, controls, and
 * `getExportCode`. Copy is built in. Omit preview.tsx / ExamplePreview.* /
 * exportExample.* when taking the shell into another app.
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

  return (
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
                <ExpandIcon />
              </button>
            ) : null}
          </div>
        )}
      </div>

      <div className={styles.body}>
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
            {copied ? <CheckIcon /> : <CopyIcon />}
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
    </section>
  );
}
