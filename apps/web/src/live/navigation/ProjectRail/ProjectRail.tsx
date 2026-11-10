import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import styles from "./ProjectRail.module.css";

export type ProjectRailItem = {
  id: string;
  title: string;
  summary?: ReactNode;
  links?: readonly { label: string; href: string }[];
};

type ProjectRailProps = {
  items: readonly ProjectRailItem[];
  label?: string;
  defaultId?: string;
  onChange?: (id: string) => void;
};

const HOVER_SELECT_MS = 70;
const DETAILS_REVEAL_MS = 70;

/** How far a dash swells: the active one fully, and up to three on either side of the hovered one. */
export function lineInfluence(index: number, activeIndex: number, hoveredIndex: number | null): number {
  const active = index === activeIndex ? 1 : 0;
  if (hoveredIndex === null) return active;
  return Math.max(active, 3 - Math.abs(index - hoveredIndex));
}

export function ProjectRail({ items, label = "Select a project", defaultId, onChange }: ProjectRailProps) {
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, items.findIndex(item => item.id === defaultId)),
  );
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [detailsShown, setDetailsShown] = useState(false);
  const hoverTimer = useRef<number | null>(null);
  const baseId = useId();

  useEffect(() => {
    if (!expanded) return;
    const timer = window.setTimeout(() => setDetailsShown(true), DETAILS_REVEAL_MS);
    return () => window.clearTimeout(timer);
  }, [expanded]);

  useEffect(
    () => () => {
      if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
    },
    [],
  );

  function clearHoverTimer() {
    if (hoverTimer.current === null) return;
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  }

  function activate(index: number) {
    if (index === activeIndex || !items[index]) return;
    setActiveIndex(index);
    setExpanded(false);
    setDetailsShown(false);
    onChange?.(items[index].id);
  }

  function hover(index: number | null) {
    setHoveredIndex(index);
    clearHoverTimer();
    if (index === null || index === activeIndex) return;
    hoverTimer.current = window.setTimeout(() => {
      hoverTimer.current = null;
      activate(index);
    }, HOVER_SELECT_MS);
  }

  function toggleDetails() {
    setDetailsShown(false);
    setExpanded(current => !current);
  }

  return (
    <nav className={styles.rail} aria-label={label} onPointerLeave={() => hover(null)}>
      {items.map((item, index) => {
        const selected = index === activeIndex;
        const open = selected && expanded;
        const detailsId = `${baseId}-${item.id}`;
        return (
          <div
            key={item.id}
            className={styles.item}
            data-selected={selected || undefined}
            data-open={open || undefined}
            style={{ "--influence": lineInfluence(index, activeIndex, hoveredIndex) } as CSSProperties}
            onMouseEnter={() => hover(index)}
          >
            <button
              type="button"
              className={styles.bar}
              aria-label={`Show ${item.title}`}
              aria-current={selected || undefined}
              tabIndex={selected ? -1 : undefined}
              onClick={() => activate(index)}
              onFocus={() => setHoveredIndex(index)}
              onBlur={() => setHoveredIndex(null)}
            />
            <div className={styles.morph} aria-hidden={selected ? undefined : true}>
              <div className={styles.header}>
                <button
                  type="button"
                  className={styles.toggle}
                  aria-expanded={open}
                  aria-controls={detailsId}
                  aria-label={open ? "Close project details" : "Open project details"}
                  tabIndex={selected ? undefined : -1}
                  onClick={toggleDetails}
                >
                  <span className={styles.icon} data-state={open ? "close" : "open"} aria-hidden="true">
                    <span data-icon="open">+</span>
                    <span data-icon="close">−</span>
                  </span>
                </button>
                <h3 className={styles.title} aria-label={item.title}>
                  {selected
                    ? Array.from(item.title).map((character, i) => (
                        <span
                          key={i}
                          className={styles.character}
                          style={{ "--character-index": i } as CSSProperties}
                          aria-hidden="true"
                        >
                          {character}
                        </span>
                      ))
                    : null}
                </h3>
              </div>
              <div id={detailsId} className={styles.details} inert={!open}>
                <div className={styles.detailsInner} data-shown={(open && detailsShown) || undefined}>
                  {item.summary ? <p className={styles.summary}>{item.summary}</p> : null}
                  {item.links?.length ? (
                    <div className={styles.links}>
                      {item.links.map(link => (
                        <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer">
                          {link.label}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      <p className={styles.srOnly} aria-live="polite" aria-atomic="true">
        {items[activeIndex]?.title}
      </p>
    </nav>
  );
}
