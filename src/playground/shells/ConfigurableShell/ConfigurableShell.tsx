import type { ReactNode } from "react";
import { ExpandIcon, MoveIcon } from "./icons";
import { ProximityControl, type ShellControl } from "./ProximityControl";
import styles from "./ConfigurableShell.module.css";

const DEFAULT_BAR_COUNT = 39;

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

/**
 * Portable configurator card — copy this folder (omit preview.tsx / TypeSpecimen.*)
 * into another app. Preview content, actions, and controls are all passed in.
 */
export function ConfigurableShell({
  children,
  actions = [],
  controls = [],
  barCount = DEFAULT_BAR_COUNT,
  onMove,
  movePressed,
  onExpand,
  expandPressed,
  expanded,
  className,
}: ConfigurableShellProps) {
  const rootClass = className ? `${styles.root} ${className}` : styles.root;

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
        {actions.length > 0 ? (
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
          </div>
        ) : null}

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
