import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { IdeaSummary } from "@react-playground/api";
import { formatSavedAt, organizeIdeas } from "./projectSwitch";
import styles from "./IdeaProjects.module.css";

const CUSTOM_FOLDER_VALUE = "__custom__";

type IdeaProjectsProps = {
  ideas: IdeaSummary[];
  folders: string[];
  ideaName: string;
  activeComponentName: string | null;
  disabled?: boolean;
  deletingComponentName?: string | null;
  onIdeaNameChange: (name: string) => void;
  onFolderChange: (folder: string) => void;
  onOpen: (componentName: string) => void;
  onNew: (folder: string) => void;
  onDelete: (componentName: string) => void;
};

type FolderEditorProps = {
  folders: string[];
  initialFolder?: string;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (folder: string) => void;
};

function FolderEditor({
  folders,
  initialFolder = "",
  submitLabel,
  onCancel,
  onSubmit,
}: FolderEditorProps) {
  const initialIsCustom = Boolean(initialFolder && !folders.includes(initialFolder));
  const [choice, setChoice] = useState(
    initialIsCustom ? CUSTOM_FOLDER_VALUE : initialFolder,
  );
  const [customFolder, setCustomFolder] = useState(
    initialIsCustom ? initialFolder : "",
  );
  const folder = choice === CUSTOM_FOLDER_VALUE ? customFolder : choice;

  return (
    <div className={styles.folderEditor}>
      <label className={styles.folderLabel}>
        <span>Live folder</span>
        <select
          className={styles.folderSelect}
          value={choice}
          onChange={event => setChoice(event.target.value)}
          autoFocus
        >
          <option value="">No folder yet</option>
          {folders.map(option => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
          <option value={CUSTOM_FOLDER_VALUE}>New folder…</option>
        </select>
      </label>
      {choice === CUSTOM_FOLDER_VALUE ? (
        <input
          className={styles.folderInput}
          type="text"
          value={customFolder}
          onChange={event => setCustomFolder(event.target.value)}
          placeholder="Folder name"
          spellCheck={false}
          aria-label="New folder name"
        />
      ) : null}
      <div className={styles.folderActions}>
        <button type="button" className={styles.cancelAction} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={styles.confirmAction}
          onClick={() => onSubmit(folder.trim())}
          disabled={choice === CUSTOM_FOLDER_VALUE && !folder.trim()}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

export function IdeaProjects({
  ideas,
  folders,
  ideaName,
  activeComponentName,
  disabled,
  deletingComponentName,
  onIdeaNameChange,
  onFolderChange,
  onOpen,
  onNew,
  onDelete,
}: IdeaProjectsProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [editingFolder, setEditingFolder] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const titleId = useId();
  const count = ideas.length;
  const groups = useMemo(() => organizeIdeas(ideas, query), [ideas, query]);
  const matchCount = groups.reduce(
    (total, group) => total + group.ideas.length,
    0,
  );
  const activeIdea = ideas.find(idea => idea.componentName === activeComponentName);
  const size = count === 0 ? "empty" : count === 1 ? "one" : count < 4 ? "few" : "many";
  const editing = creating || editingFolder;

  useEffect(() => {
    setEditingFolder(false);
  }, [activeComponentName]);

  useEffect(() => {
    if (!open) return;

    function close() {
      setOpen(false);
      setCreating(false);
      setEditingFolder(false);
    }

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (editing) {
        setCreating(false);
        setEditingFolder(false);
      } else {
        close();
        triggerRef.current?.focus();
      }
    }

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [editing, open]);

  function closeAnd(action: () => void) {
    setOpen(false);
    setCreating(false);
    setEditingFolder(false);
    action();
  }

  return (
    <div className={styles.root} ref={rootRef}>
      <label className={styles.currentIdea}>
        <span className={styles.visuallyHidden}>Current idea name</span>
        <input
          className={styles.currentIdeaInput}
          type="text"
          value={ideaName}
          onChange={event => onIdeaNameChange(event.target.value)}
          placeholder="Untitled idea"
          spellCheck={false}
          disabled={disabled}
        />
      </label>

      <div
        className={styles.surface}
        data-open={open || undefined}
        data-size={size}
        data-editing={editing || undefined}
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

          {count > 3 && !editing ? (
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

          <div className={styles.newIdea} data-expanded={creating || undefined}>
            {creating ? (
              <FolderEditor
                folders={folders}
                submitLabel="Create"
                onCancel={() => setCreating(false)}
                onSubmit={folder => closeAnd(() => onNew(folder))}
              />
            ) : (
              <button
                type="button"
                className={styles.newIdeaButton}
                aria-current={activeComponentName == null ? "page" : undefined}
                onClick={() => {
                  setEditingFolder(false);
                  setCreating(true);
                }}
              >
                <span className={styles.newIdeaCopy}>
                  <span className={styles.newIdeaName}>New idea</span>
                <span className={styles.newIdeaMeta}>
                  Start with an empty stage
                </span>
                </span>
                <span className={styles.newIdeaAction}>Create</span>
              </button>
            )}
          </div>

          {!creating ? (
            count === 0 ? (
              <p className={styles.empty}>Save to keep this project and switch back later.</p>
            ) : matchCount === 0 ? (
              <p className={styles.empty}>No ideas match “{query.trim()}”.</p>
            ) : (
              <ul className={styles.list}>
                {groups.map(group => (
                  <li className={styles.group} key={group.folder || "unassigned"}>
                    <p className={styles.groupLabel}>
                      {group.folder || "Unassigned"}
                    </p>
                    <ul
                      className={styles.groupList}
                      aria-label={group.folder || "Unassigned"}
                    >
                      {group.ideas.map(idea => {
                        const selected = idea.componentName === activeComponentName;
                        const deleting = idea.componentName === deletingComponentName;
                        return (
                          <li className={styles.ideaRow} key={idea.componentName}>
                            <div className={styles.ideaRowMain}>
                              <button
                                type="button"
                                className={styles.row}
                                aria-current={selected ? "page" : undefined}
                                data-selected={selected || undefined}
                                onClick={() => closeAnd(() => onOpen(idea.componentName))}
                              >
                                <span className={styles.rowName}>{idea.name}</span>
                                <span className={styles.rowMeta}>
                                  {idea.componentName}
                                  {" · "}
                                  {formatSavedAt(idea.savedAt)}
                                </span>
                              </button>
                              {selected ? (
                                <button
                                  type="button"
                                  className={styles.rowFolder}
                                  aria-label={`Change folder for ${idea.name}`}
                                  title="Change Live folder"
                                  aria-expanded={editingFolder}
                                  onClick={() => {
                                    setCreating(false);
                                    setEditingFolder(current => !current);
                                  }}
                                >
                                  <svg
                                    width="15"
                                    height="15"
                                    viewBox="0 0 18 18"
                                    aria-hidden="true"
                                  >
                                    <path d="M2.5 5.25h5l1.5 1.5h6.5v7.5h-13z" />
                                  </svg>
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className={styles.rowDelete}
                                aria-label={`Delete ${idea.name}`}
                                title={`Delete ${idea.name}`}
                                disabled={deleting}
                                onClick={() => onDelete(idea.componentName)}
                              >
                                {deleting ? "Deleting…" : "Delete"}
                              </button>
                            </div>
                            {selected && editingFolder ? (
                              <FolderEditor
                                key={activeIdea?.folder}
                                folders={folders}
                                initialFolder={activeIdea?.folder}
                                submitLabel="Done"
                                onCancel={() => setEditingFolder(false)}
                                onSubmit={folder => {
                                  onFolderChange(folder);
                                  setEditingFolder(false);
                                }}
                              />
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            )
          ) : null}
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
          onClick={() => {
            setOpen(current => !current);
            if (open) {
              setCreating(false);
              setEditingFolder(false);
            }
          }}
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
