import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { IdeaSummary } from "@react-playground/api";
import { filterIdeas, formatUpdatedAt } from "./projectSwitch";
import styles from "./IdeaProjects.module.css";

type IdeaProjectsProps = {
  ideas: IdeaSummary[];
  ideaName: string;
  activeIdeaId: string | null;
  open?: boolean;
  disabled?: boolean;
  deletingIdeaId?: string | null;
  onIdeaNameChange: (name: string) => void;
  onOpenChange?: (open: boolean) => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
};

export function IdeaProjects({
  ideas,
  ideaName,
  activeIdeaId,
  open: controlledOpen,
  disabled,
  deletingIdeaId,
  onIdeaNameChange,
  onOpenChange,
  onOpen,
  onNew,
  onDelete,
}: IdeaProjectsProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const titleId = useId();
  const count = ideas.length;
  const matches = useMemo(() => filterIdeas(ideas, query), [ideas, query]);
  const size = count === 0 ? "empty" : count === 1 ? "one" : count < 4 ? "few" : "many";

  function setOpen(nextOpen: boolean) {
    setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }

  useEffect(() => {
    if (!open) return;

    function close() {
      setOpen(false);
    }

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      close();
      triggerRef.current?.focus();
    }

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function closeAnd(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div
      className={styles.root}
      ref={rootRef}
      data-open={open || undefined}
      inert={disabled ? true : undefined}
    >
      {open ? (
        <div
          className={styles.backdrop}
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <label className={styles.currentIdea}>
        <span className={styles.visuallyHidden}>Current idea name</span>
        <input
          className={styles.currentIdeaInput}
          type="text"
          value={ideaName}
          onChange={event => onIdeaNameChange(event.target.value)}
          placeholder="Untitled idea"
          spellCheck={false}
          disabled={disabled || open}
        />
      </label>

      <div
        className={styles.surface}
        data-open={open || undefined}
        data-size={size}
      >
        <div
          className={styles.menu}
          id={listId}
          role="dialog"
          aria-labelledby={titleId}
          inert={open ? undefined : true}
        >
          <div className={styles.menuHeader}>
            <div className={styles.menuHeading}>
              <span className={styles.menuTitle} id={titleId}>
                Experimental ideas
              </span>
              <span className={styles.menuCount}>{count}</span>
            </div>
          </div>

          {count > 3 ? (
            <label className={styles.searchField}>
              <span className={styles.visuallyHidden}>Filter ideas</span>
              <input
                className={styles.searchInput}
                type="search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Filter ideas…"
              />
            </label>
          ) : null}

          <div className={styles.newIdea}>
            <button
              type="button"
              className={styles.newIdeaButton}
              aria-current={activeIdeaId == null ? "page" : undefined}
              onClick={() => closeAnd(onNew)}
            >
              <span className={styles.newIdeaCopy}>
                <span className={styles.newIdeaName}>New idea</span>
              </span>
              <span className={styles.newIdeaAction}>Create</span>
            </button>
          </div>

          {count === 0 ? (
            <p className={styles.empty}>Save to keep this project and switch back later.</p>
          ) : matches.length === 0 ? (
            <p className={styles.empty}>No ideas match “{query.trim()}”.</p>
          ) : (
            <ul className={styles.list}>
              {matches.map(idea => {
                const selected = idea.id === activeIdeaId;
                const deleting = idea.id === deletingIdeaId;
                return (
                  <li className={styles.ideaRow} key={idea.id}>
                    <div className={styles.ideaRowMain}>
                      <button
                        type="button"
                        className={styles.row}
                        aria-current={selected ? "page" : undefined}
                        data-selected={selected || undefined}
                        onClick={() => closeAnd(() => onOpen(idea.id))}
                      >
                        <span className={styles.rowName}>{idea.name}</span>
                        <span className={styles.rowMeta}>
                          {formatUpdatedAt(idea.updatedAt)}
                        </span>
                      </button>
                      <button
                        type="button"
                        className={styles.rowDelete}
                        aria-label={`Delete ${idea.name}`}
                        title={`Delete ${idea.name}`}
                        disabled={deleting}
                        onClick={() => onDelete(idea.id)}
                      >
                        {deleting ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <button
          ref={triggerRef}
          type="button"
          className={styles.trigger}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={
            open ? "Close experimental ideas" : "Open experimental ideas"
          }
          disabled={disabled}
          onClick={() => setOpen(!open)}
        >
          <span
            className={styles.iconSwap}
            data-state={open ? "close" : "open"}
          >
            <svg className={styles.icon} data-icon="open" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M10 4V16M4 10H16" />
            </svg>
            <svg className={styles.icon} data-icon="close" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M5 5L15 15M15 5L5 15" />
            </svg>
          </span>
        </button>
      </div>
    </div>
  );
}
