import { useEffect, useRef, useState } from "react";
import styles from "./FolderEditor.module.css";

const CUSTOM_FOLDER_VALUE = "__custom__";

type FolderEditorProps = {
  folders: string[];
  initialFolder?: string;
  submitLabel: string;
  destinationHint?: string;
  onCancel: () => void;
  onSubmit: (folder: string) => void;
};

function defaultFolderChoice(folders: string[], initialFolder: string): string {
  if (initialFolder && folders.includes(initialFolder)) return initialFolder;
  if (initialFolder) return CUSTOM_FOLDER_VALUE;
  return folders[0] ?? CUSTOM_FOLDER_VALUE;
}

export function FolderEditor({
  folders,
  initialFolder = "",
  submitLabel,
  destinationHint,
  onCancel,
  onSubmit,
}: FolderEditorProps) {
  const [choice, setChoice] = useState(() =>
    defaultFolderChoice(folders, initialFolder),
  );
  const [customFolder, setCustomFolder] = useState(
    initialFolder && !folders.includes(initialFolder) ? initialFolder : "",
  );
  const selectRef = useRef<HTMLSelectElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const folder = choice === CUSTOM_FOLDER_VALUE ? customFolder : choice;
  const custom = choice === CUSTOM_FOLDER_VALUE;

  useEffect(() => {
    selectRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!custom) return;
    inputRef.current?.focus();
  }, [custom]);

  return (
    <form
      className={styles.editor}
      data-custom={custom || undefined}
      onSubmit={event => {
        event.preventDefault();
        const next = folder.trim();
        if (!next) return;
        onSubmit(next);
      }}
    >
      <label className={styles.label}>
        <span>Live folder</span>
        <select
          ref={selectRef}
          className={styles.select}
          value={choice}
          onChange={event => setChoice(event.target.value)}
        >
          {folders.map(option => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
          <option value={CUSTOM_FOLDER_VALUE}>New folder…</option>
        </select>
      </label>
      <div className={styles.customSlot} data-open={custom || undefined}>
        <div className={styles.customSlotInner}>
          <input
            ref={inputRef}
            className={styles.input}
            type="text"
            value={customFolder}
            onChange={event => setCustomFolder(event.target.value)}
            placeholder="Folder name"
            spellCheck={false}
            tabIndex={custom ? 0 : -1}
            aria-hidden={custom ? undefined : true}
            aria-label="New folder name"
          />
        </div>
      </div>
      {destinationHint ? (
        <p className={styles.hint}>{destinationHint}</p>
      ) : null}
      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          className={styles.confirm}
          disabled={!folder.trim()}
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
