import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import styles from "./MenuPill.module.css";
import {
  CLOSE_EASE,
  CLOSE_MS,
  FADE_IN_MS,
  FADE_OUT_MS,
  OPEN_EASE,
  OPEN_MS,
  PILL_CLOSED_WIDTH,
  cssBezier,
  revealDelay,
} from "./revealTiming";

export type MenuPillItem = {
  id: string;
  label: ReactNode;
  /** Needed when the label is an icon. */
  ariaLabel?: string;
  /** Marks the current choice with a dot. */
  active?: boolean;
  /** Settings such as a theme stay open after a pick; links close the menu. */
  keepOpen?: boolean;
  onSelect?: () => void;
};

type MenuPillProps = {
  label: string;
  /** Each group is set off from the next by a hairline divider. */
  groups: readonly (readonly MenuPillItem[])[];
};

const HOVER_QUERY = "(hover: hover) and (pointer: fine)";
const REVEAL_SHIFT_PX = 6;

const timingVars = {
  "--pill-closed-width": `${PILL_CLOSED_WIDTH}px`,
  "--open-duration": `${OPEN_MS}ms`,
  "--close-duration": `${CLOSE_MS}ms`,
  "--open-ease": cssBezier(OPEN_EASE),
  "--close-ease": cssBezier(CLOSE_EASE),
  "--fade-in-duration": `${FADE_IN_MS}ms`,
  "--fade-out-duration": `${FADE_OUT_MS}ms`,
} as CSSProperties;

/** Measured once per layout change and written straight to each child, so opening never re-renders or re-measures. */
function stageReveal(nav: HTMLElement) {
  const center = nav.clientWidth / 2;
  for (const child of Array.from(nav.children) as HTMLElement[]) {
    const left = child.offsetLeft - center;
    const right = left + child.offsetWidth;
    const near = left < 0 && right > 0 ? 0 : Math.min(Math.abs(left), Math.abs(right));
    const far = Math.max(Math.abs(left), Math.abs(right));
    const side = left + right < 0 ? 1 : -1;
    child.style.setProperty("--reveal-delay", `${revealDelay(near, far, center)}ms`);
    child.style.setProperty("--reveal-shift", `${side * REVEAL_SHIFT_PX}px`);
  }
}

export function MenuPill({ label, groups }: MenuPillProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const linksId = useId();
  const layoutKey = groups.map(group => group.map(item => item.id).join(",")).join("|");

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    stageReveal(nav);
    const observer = new ResizeObserver(() => stageReveal(nav));
    observer.observe(nav);
    for (const child of Array.from(nav.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [layoutKey]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const hovers = () => window.matchMedia(HOVER_QUERY).matches;

  function select(item: MenuPillItem) {
    item.onSelect?.();
    if (!item.keepOpen) setOpen(false);
  }

  return (
    <div
      ref={rootRef}
      className={styles.root}
      style={timingVars}
      data-open={open || undefined}
      onPointerEnter={event => {
        if (event.pointerType === "mouse" && hovers()) setOpen(true);
      }}
      onPointerLeave={event => {
        if (event.pointerType !== "mouse" || !hovers()) return;
        if (event.relatedTarget instanceof Node && rootRef.current?.contains(event.relatedTarget)) return;
        setOpen(false);
      }}
    >
      <span className={styles.pill} aria-hidden="true" />
      <nav ref={navRef} id={linksId} className={styles.links} aria-label={label} inert={!open}>
        {groups.map((group, index) => (
          <Fragment key={index}>
            {index > 0 ? <span className={styles.divider} aria-hidden="true" /> : null}
            {group.map(item => (
              <button
                key={item.id}
                type="button"
                className={styles.item}
                data-active={item.active || undefined}
                aria-pressed={item.active ?? undefined}
                aria-label={item.ariaLabel}
                onClick={() => select(item)}
              >
                {item.label}
              </button>
            ))}
          </Fragment>
        ))}
      </nav>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-label={open ? `Close ${label}` : `Open ${label}`}
        aria-controls={linksId}
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
      >
        <span aria-hidden="true" />
      </button>
    </div>
  );
}

type IconSwapProps<Key extends string> = {
  value: Key;
  states: Record<Key, ReactNode>;
};

/** Cross-fades between icons with a blur-and-scale swap. */
export function IconSwap<Key extends string>({ value, states }: IconSwapProps<Key>) {
  return (
    <span className={styles.swap} aria-hidden="true">
      {(Object.keys(states) as Key[]).map(key => (
        <span key={key} className={styles.swapState} data-shown={key === value || undefined}>
          {states[key]}
        </span>
      ))}
    </span>
  );
}
