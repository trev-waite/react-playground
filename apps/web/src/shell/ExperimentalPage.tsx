import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  EXPERIMENTAL_FOLDER,
  SHELLS_FOLDER,
  normalizeFolder,
  toComponentName,
  type IdeaSummary,
  type SavedIdea,
} from "@react-playground/api";
import { playgroundEntries } from "../lib/discover";
import type { IdeaStudioSession } from "../lib/ideaSession";
import { getIdeaDraft, getIdeaSource } from "../lib/ideaExport";
import { playgroundApi } from "../lib/playgroundApi";
import { useView } from "./view/ViewController";
import styles from "./ExperimentalPage.module.css";

const IdeaWorkbench = lazy(() => import("./IdeaWorkbench"));

const DEFAULT_IDEA_NAME = "Untitled idea";
const NEW_FOLDER_VALUE = "__new__";
const UNSAVED_VALUE = "";

function existingFolders(): string[] {
  const folders = new Set<string>();
  for (const entry of playgroundEntries) {
    const [folder] = entry.slug.split("/");
    if (folder && folder !== SHELLS_FOLDER && folder !== EXPERIMENTAL_FOLDER) {
      folders.add(folder);
    }
  }
  return [...folders].sort((a, b) => a.localeCompare(b));
}

function ideaNameFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/experimental\/([A-Za-z][A-Za-z0-9]*)\/?$/);
  return match?.[1] ?? null;
}

export function ExperimentalPage() {
  const { mode, promote, promoting, promoteError } = useView();
  const location = useLocation();
  const navigate = useNavigate();

  const folders = useMemo(() => existingFolders(), []);
  const [ideaName, setIdeaName] = useState(DEFAULT_IDEA_NAME);
  const [folderChoice, setFolderChoice] = useState(
    () => folders[0] ?? NEW_FOLDER_VALUE,
  );
  const [customFolder, setCustomFolder] = useState("");
  const [studioKey, setStudioKey] = useState(0);
  const [session, setSession] = useState<IdeaStudioSession>({ kind: "demo" });
  const [ideas, setIdeas] = useState<IdeaSummary[]>([]);
  const [activeComponentName, setActiveComponentName] = useState<string | null>(
    null,
  );
  const [dirty, setDirty] = useState(false);
  const [hasDraft, setHasDraft] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [activated, setActivated] = useState(() => mode === "experimental");
  const initialPathRef = useRef(location.pathname);
  const applyLoadedIdeaRef = useRef<(idea: SavedIdea) => void>(() => {});
  const saveIdeaRef = useRef<() => Promise<string | null>>(async () => null);
  const openingFromUrl = Boolean(ideaNameFromPath(initialPathRef.current));
  const workbenchReady = hydrated || !openingFromUrl;

  const usingNewFolder = folderChoice === NEW_FOLDER_VALUE;
  const folderValue = usingNewFolder ? customFolder : folderChoice;
  const folderSlug = normalizeFolder(folderValue);
  const componentName = toComponentName(ideaName.trim() || DEFAULT_IDEA_NAME);
  const experimentalPath =
    componentName != null
      ? `${EXPERIMENTAL_FOLDER}/${componentName}/`
      : `${EXPERIMENTAL_FOLDER}/…/`;
  const livePath =
    folderSlug && componentName
      ? `${folderSlug}/${componentName}/`
      : "folder/ComponentName/";
  const errorMessage = saveError ?? promoteError;
  const canSave =
    workbenchReady && hasDraft && (dirty || !activeComponentName) && !saving;
  const markDirty = useCallback(() => setDirty(true), []);

  const applyFolder = useCallback(
    (folder: string) => {
      if (folder && folders.includes(folder)) {
        setFolderChoice(folder);
        setCustomFolder("");
        return;
      }
      if (folder) {
        setFolderChoice(NEW_FOLDER_VALUE);
        setCustomFolder(folder);
        return;
      }
      setFolderChoice(folders[0] ?? NEW_FOLDER_VALUE);
      setCustomFolder("");
    },
    [folders],
  );

  const applyLoadedIdea = useCallback(
    (idea: SavedIdea) => {
      setIdeaName(idea.name);
      applyFolder(idea.folder);
      setActiveComponentName(idea.componentName);
      setSession(
        idea.studio
          ? { kind: "restore", studio: idea.studio }
          : { kind: "blank" },
      );
      setHasDraft(Boolean(idea.studio));
      setDirty(false);
      setSaveError(null);
      setStudioKey(key => key + 1);
    },
    [applyFolder],
  );
  applyLoadedIdeaRef.current = applyLoadedIdea;

  useEffect(() => {
    if (mode === "experimental") setActivated(true);
  }, [mode]);

  function resetToBlank() {
    setIdeaName(DEFAULT_IDEA_NAME);
    setActiveComponentName(null);
    setSession({ kind: "blank" });
    setDirty(false);
    setHasDraft(false);
    setSaveError(null);
    setStudioKey(key => key + 1);
    navigate("/experimental", { replace: true });
  }

  useEffect(() => {
    if (!activated) return;
    let cancelled = false;

    void (async () => {
      try {
        const listed = await playgroundApi.listIdeas();
        if (cancelled) return;
        setIdeas(listed);

        const fromUrl = ideaNameFromPath(initialPathRef.current);
        if (!fromUrl) return;
        applyLoadedIdeaRef.current(await playgroundApi.loadIdea(fromUrl));
      } catch {
        if (!cancelled) setSaveError("Could not load saved prototypes");
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activated]);

  async function saveIdea(): Promise<string | null> {
    const draft = getIdeaDraft();
    if (!draft?.source.trim()) {
      setSaveError("Nothing to save yet");
      return null;
    }

    setSaving(true);
    setSaveError(null);

    try {
      const data = await playgroundApi.saveIdea({
        name: ideaName,
        folder: folderValue,
        source: draft.source,
        studio: draft.studio,
        previousComponentName: activeComponentName ?? undefined,
      });
      setIdeas(data.ideas);
      setActiveComponentName(data.idea.componentName);
      setDirty(false);
      navigate(`/experimental/${data.idea.componentName}`, { replace: true });
      return data.idea.componentName;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
      return null;
    } finally {
      setSaving(false);
    }
  }
  saveIdeaRef.current = saveIdea;

  async function persistIfDirty(): Promise<boolean> {
    if (!dirty) return true;
    const draft = getIdeaDraft();
    if (!draft?.source.trim()) return true;
    return (await saveIdea()) != null;
  }

  async function onSelectPrototype(next: string) {
    if (next === (activeComponentName ?? UNSAVED_VALUE)) return;
    if (!(await persistIfDirty())) return;
    if (!next) return;
    try {
      applyLoadedIdea(await playgroundApi.loadIdea(next));
      navigate(`/experimental/${next}`, { replace: true });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not open prototype");
    }
  }

  async function onNewIdea() {
    if (!(await persistIfDirty())) return;
    resetToBlank();
  }

  async function onDelete() {
    if (!activeComponentName) return;
    const confirmed = window.confirm(
      `Delete experimental prototype “${ideaName}”? This cannot be undone.`,
    );
    if (!confirmed) return;

    setSaveError(null);
    try {
      setIdeas(await playgroundApi.deleteIdea(activeComponentName));
      resetToBlank();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not delete prototype");
    }
  }

  async function onMakeLive() {
    if (!folderSlug || !componentName) {
      setSaveError("Choose or enter a folder");
      return;
    }

    const dest = `apps/web/src/playground/${livePath}`;
    const willDiscard = Boolean(activeComponentName || dirty);
    const confirmed = window.confirm(
      willDiscard
        ? `Publish “${ideaName}” to ${dest}? The experimental copy will be removed.`
        : `Publish “${ideaName}” to ${dest}?`,
    );
    if (!confirmed) return;

    let discard = activeComponentName ?? undefined;
    if (dirty) {
      const savedName = await saveIdea();
      if (!savedName) return;
      discard = savedName;
    }

    const source = getIdeaSource();
    if (!source) {
      setSaveError("Nothing to publish yet");
      return;
    }

    await promote({
      folder: folderValue,
      name: ideaName,
      source,
      discardExperimental: discard,
    });
  }

  useEffect(() => {
    if (mode !== "experimental") return;

    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") {
        return;
      }
      event.preventDefault();
      if (!canSave) return;
      void saveIdeaRef.current();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, canSave]);

  useEffect(() => {
    if (!dirty || !hasDraft) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, hasDraft]);

  const saveLabel = !dirty && activeComponentName ? "Saved" : "Save";
  const switcherValue = activeComponentName ?? UNSAVED_VALUE;

  return (
    <div className={styles.page}>
      <div className={styles.atmosphere} aria-hidden="true" />

      <header className={styles.topBar}>
        <div className={styles.identity}>
          <label className={styles.ideaField}>
            <span className={styles.fieldLabel}>Idea</span>
            <input
              className={styles.ideaInput}
              type="text"
              value={ideaName}
              onChange={event => {
                setIdeaName(event.target.value);
                setDirty(true);
              }}
              placeholder={DEFAULT_IDEA_NAME}
              spellCheck={false}
            />
          </label>

          {hydrated && ideas.length > 0 ? (
            <label className={styles.folderField}>
              <span className={styles.fieldLabel} id="prototype-label">
                Prototype
              </span>
              <select
                className={styles.folderSelect}
                value={switcherValue}
                onChange={event => void onSelectPrototype(event.target.value)}
                aria-labelledby="prototype-label"
              >
                {activeComponentName == null ? (
                  <option value={UNSAVED_VALUE}>Unsaved idea</option>
                ) : null}
                {ideas.map(idea => (
                  <option key={idea.componentName} value={idea.componentName}>
                    {idea.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className={styles.folderField}>
            <span className={styles.fieldLabel} id="folder-label">
              Live folder
            </span>
            <div className={styles.folderRow}>
              <select
                className={styles.folderSelect}
                value={folderChoice}
                onChange={event => {
                  setFolderChoice(event.target.value);
                  setDirty(true);
                }}
                aria-labelledby="folder-label"
              >
                {folders.map(folder => (
                  <option key={folder} value={folder}>
                    {folder}
                  </option>
                ))}
                <option value={NEW_FOLDER_VALUE}>New folder…</option>
              </select>
              <input
                className={styles.folderInput}
                type="text"
                value={customFolder}
                onChange={event => {
                  setCustomFolder(event.target.value);
                  setDirty(true);
                }}
                placeholder="e.g. shapes"
                spellCheck={false}
                aria-label="New folder name"
                tabIndex={usingNewFolder ? 0 : -1}
                data-visible={usingNewFolder || undefined}
              />
            </div>
            <p
              className={styles.pathHint}
              title={`WIP apps/web/src/playground/${experimentalPath} · Live apps/web/src/playground/${livePath}`}
            >
              Saves to{" "}
              <code className={styles.code}>
                apps/web/src/playground/{experimentalPath}
              </code>
              {" · "}
              Live{" "}
              <code className={styles.code}>
                apps/web/src/playground/{livePath}
              </code>
            </p>
          </div>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.clear}
            onClick={() => void onNewIdea()}
            disabled={!workbenchReady}
          >
            New idea
          </button>
          {activeComponentName ? (
            <button
              type="button"
              className={styles.delete}
              onClick={() => void onDelete()}
              disabled={saving || promoting}
            >
              Delete
            </button>
          ) : null}
          <button
            type="button"
            className={styles.save}
            onClick={() => void saveIdea()}
            disabled={!canSave}
            title="Save (⌘S)"
            data-saved={!dirty && activeComponentName ? true : undefined}
          >
            {saving ? "Saving…" : saveLabel}
          </button>
          <button
            type="button"
            className={styles.makeLive}
            disabled={promoting || saving || !workbenchReady || !hasDraft}
            onClick={() => void onMakeLive()}
          >
            {promoting ? "Publishing…" : "Make Live"}
          </button>
          {errorMessage ? (
            <p className={styles.error} role="alert">
              {errorMessage}
            </p>
          ) : null}
        </div>
      </header>

      <main className={styles.main} aria-label="Component workbench">
        <Suspense fallback={<p className={styles.status}>Loading…</p>}>
          <div className={styles.workbench}>
            {workbenchReady ? (
              <IdeaWorkbench
                key={studioKey}
                session={session}
                onMutate={markDirty}
                onDraftChange={setHasDraft}
              />
            ) : (
              <p className={styles.status}>Loading…</p>
            )}
          </div>
        </Suspense>
      </main>
    </div>
  );
}
