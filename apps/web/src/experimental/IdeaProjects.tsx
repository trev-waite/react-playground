import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
  onNew: (name: string) => void;
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
  const [newName, setNewName] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [shakeNonce, setShakeNonce] = useState(0);
  const [menuHeight, setMenuHeight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const titleId = useId();
  const titleFieldId = useId();
  const count = ideas.length;
  const matches = useMemo(() => filterIdeas(ideas, query), [ideas, query]);

  function setOpen(nextOpen: boolean) {
    if (!nextOpen) {
      setNewName("");
      setInvalid(false);
    }
    setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const measure = () => setMenuHeight(el.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [open, count, query, matches.length]);

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
      event.preventDefault();
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

  function submitNewIdea() {
    const name = newName.trim();
    if (!name) {
      setInvalid(true);
      setShakeNonce(nonce => nonce + 1);
      nameInputRef.current?.focus();
      return;
    }
    closeAnd(() => onNew(name));
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
        <span className={styles.visuallyHidden}>Current idea title</span>
        <input
          className={styles.currentIdeaInput}
          type="text"
          name="idea-title"
          value={ideaName}
          onChange={event => onIdeaNameChange(event.target.value)}
          placeholder="Untitled idea"
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          disabled={disabled || open}
        />
      </label>

      <div
        className={styles.surface}
        data-open={open || undefined}
        style={
          menuHeight > 0
            ? ({ "--menu-height": `${menuHeight}px` } as CSSProperties)
            : undefined
        }
      >
        <div
          className={styles.menu}
          id={listId}
          ref={menuRef}
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

          <form
            className={styles.newIdea}
            onSubmit={event => {
              event.preventDefault();
              submitNewIdea();
            }}
          >
            <div className={styles.newIdeaField}>
              <label className={styles.visuallyHidden} htmlFor={titleFieldId}>
                New idea title
              </label>
              <input
                id={titleFieldId}
                ref={nameInputRef}
                className={styles.newIdeaInput}
                type="text"
                name="new-idea-title"
                value={newName}
                placeholder="New idea"
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                aria-invalid={invalid || undefined}
                data-shake={
                  invalid ? (shakeNonce % 2 === 0 ? "even" : "odd") : undefined
                }
                onChange={event => {
                  setNewName(event.target.value);
                  if (invalid && event.target.value.trim()) setInvalid(false);
                }}
              />
            </div>
            <button type="submit" className={styles.newIdeaAction}>
              Create
            </button>
          </form>

          <div className={styles.ideaSection}>
            {count === 0 ? (
              <p className={styles.empty}>Create an idea to start switching.</p>
            ) : matches.length === 0 ? (
              <p className={styles.empty}>No ideas match “{query.trim()}”.</p>
            ) : (
              <ul className={styles.list}>
                {matches.map(idea => {
                  const selected = idea.id === activeIdeaId;
                  const deleting = idea.id === deletingIdeaId;
                  return (
                    <li className={styles.ideaRow} key={idea.id}>
                      <div
                        className={styles.ideaRowMain}
                        data-selected={selected || undefined}
                      >
                        <button
                          type="button"
                          className={styles.row}
                          aria-current={selected ? "page" : undefined}
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
