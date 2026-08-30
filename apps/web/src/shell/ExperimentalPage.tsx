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
import { IdeaProjects } from "./IdeaProjects";
import { ideaNameFromPath, initialIdeaComponentName } from "./projectSwitch";
import { useView } from "./view/ViewController";
import styles from "./ExperimentalPage.module.css";

const IdeaWorkbench = lazy(() => import("./IdeaWorkbench"));

const DEFAULT_IDEA_NAME = "Untitled idea";

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

export function ExperimentalPage() {
  const { mode, promote, promoting, promoteError } = useView();
  const location = useLocation();
  const navigate = useNavigate();

  const folders = useMemo(() => existingFolders(), []);
  const [ideaName, setIdeaName] = useState(DEFAULT_IDEA_NAME);
  const [folder, setFolder] = useState("");
  const [studioKey, setStudioKey] = useState(0);
  const [session, setSession] = useState<IdeaStudioSession>({ kind: "blank" });
  const [ideas, setIdeas] = useState<IdeaSummary[]>([]);
  const [activeComponentName, setActiveComponentName] = useState<string | null>(
    null,
  );
  const [dirty, setDirty] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingComponentName, setDeletingComponentName] = useState<string | null>(
    null,
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [activated, setActivated] = useState(() => mode === "experimental");
  const initialPathRef = useRef(location.pathname);
  const applyLoadedIdeaRef = useRef<(idea: SavedIdea) => void>(() => {});
  const saveIdeaRef = useRef<() => Promise<string | null>>(async () => null);
  const switchToRef = useRef<(next: string) => Promise<void>>(async () => {});
  const workbenchReady = hydrated;

  const folderSlug = normalizeFolder(folder);
  const componentName = toComponentName(ideaName.trim() || DEFAULT_IDEA_NAME);
  const livePath =
    folderSlug && componentName
      ? `${folderSlug}/${componentName}/`
      : "folder/ComponentName/";
  const errorMessage = saveError ?? promoteError;
  const canSave =
    workbenchReady && hasDraft && (dirty || !activeComponentName) && !saving;
  const markDirty = useCallback(() => setDirty(true), []);
  const displayedIdeas = useMemo(
    () =>
      ideas.map(idea =>
        idea.componentName === activeComponentName
          ? { ...idea, name: ideaName, folder }
          : idea,
      ),
    [activeComponentName, folder, ideaName, ideas],
  );

  const applyLoadedIdea = useCallback(
    (idea: SavedIdea) => {
      setIdeaName(idea.name);
      setFolder(idea.folder);
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
    [],
  );
  applyLoadedIdeaRef.current = applyLoadedIdea;

  useEffect(() => {
    if (mode === "experimental") setActivated(true);
  }, [mode]);

  function resetToBlank(nextFolder = "") {
    setIdeaName(DEFAULT_IDEA_NAME);
    setFolder(nextFolder);
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

        const componentToOpen = initialIdeaComponentName(
          initialPathRef.current,
          listed,
        );
        if (!componentToOpen) return;

        const loadedIdea = await playgroundApi.loadIdea(componentToOpen);
        if (cancelled) return;
        applyLoadedIdeaRef.current(loadedIdea);
        navigate(`/experimental/${loadedIdea.componentName}`, { replace: true });
      } catch {
        if (!cancelled) setSaveError("Could not load saved projects");
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activated, navigate]);

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
        folder,
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

  async function switchTo(next: string) {
    if (next === activeComponentName) return;
    if (!(await persistIfDirty())) return;
    try {
      applyLoadedIdea(await playgroundApi.loadIdea(next));
      navigate(`/experimental/${next}`, { replace: true });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not open project");
    }
  }
  switchToRef.current = switchTo;

  async function startNewIdea(nextFolder: string) {
    if (!(await persistIfDirty())) return;
    resetToBlank(nextFolder);
  }

  useEffect(() => {
    if (!hydrated) return;
    const fromUrl = ideaNameFromPath(location.pathname);
    if (!fromUrl) return;
    void switchToRef.current(fromUrl);
  }, [hydrated, location.pathname]);

  async function onDelete(componentNameToDelete: string) {
    const idea = displayedIdeas.find(
      item => item.componentName === componentNameToDelete,
    );
    if (!idea) return;
    const confirmed = window.confirm(
      `Delete experimental project “${idea.name}”? This cannot be undone.`,
    );
    if (!confirmed) return;

    setSaveError(null);
    setDeletingComponentName(componentNameToDelete);
    try {
      setIdeas(await playgroundApi.deleteIdea(componentNameToDelete));
      if (componentNameToDelete === activeComponentName) resetToBlank();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not delete project");
    } finally {
      setDeletingComponentName(null);
    }
  }

  async function onMakeLive() {
    if (!folderSlug || !componentName) {
      setSaveError("Choose a Live folder from the ideas menu");
      return;
    }

    const dest = `apps/web/src/playground/${livePath}`;
    const confirmed = window.confirm(
      `Publish “${ideaName}” to ${dest}? It will show up in Live. This experimental copy stays so you can keep iterating.`,
    );
    if (!confirmed) return;

    if (dirty) {
      const savedName = await saveIdea();
      if (!savedName) return;
    }

    const source = getIdeaSource();
    if (!source) {
      setSaveError("Nothing to publish yet");
      return;
    }

    await promote({
      folder,
      name: ideaName,
      source,
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

  return (
    <div className={styles.page}>
      <div className={styles.atmosphere} aria-hidden="true" />

      <header className={styles.topBar}>
        <div
          className={styles.identity}
          data-loading={!hydrated || undefined}
          aria-busy={!hydrated}
          inert={!hydrated ? true : undefined}
        >
          <div className={styles.toolbar}>
            <IdeaProjects
              ideas={displayedIdeas}
              folders={folders}
              ideaName={ideaName}
              activeComponentName={activeComponentName}
              disabled={!workbenchReady}
              deletingComponentName={deletingComponentName}
              onIdeaNameChange={name => {
                setIdeaName(name);
                setDirty(true);
              }}
              onFolderChange={nextFolder => {
                setFolder(nextFolder);
                setDirty(true);
              }}
              onOpen={name => void switchTo(name)}
              onNew={nextFolder => void startNewIdea(nextFolder)}
              onDelete={name => void onDelete(name)}
            />

            <div className={styles.editorActions}>
              <button
                type="button"
                className={`${styles.iconButton} ${styles.delete}`}
                onClick={() => {
                  if (activeComponentName) void onDelete(activeComponentName);
                }}
                disabled={
                  !activeComponentName ||
                  saving ||
                  promoting ||
                  deletingComponentName != null
                }
                aria-label={deletingComponentName ? "Deleting idea" : "Delete idea"}
                title="Delete idea"
              >
                {deletingComponentName ? (
                  <span className={styles.spinner} aria-hidden="true" />
                ) : (
                  <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true">
                    <path d="M3.75 5.25h10.5M7 5.25V3.5h4v1.75M5.25 5.25l.65 9.25h6.2l.65-9.25M7.5 7.75v4.5M10.5 7.75v4.5" />
                  </svg>
                )}
              </button>
              <button
                type="button"
                className={`${styles.iconButton} ${styles.save}`}
                onClick={() => void saveIdea()}
                disabled={!canSave}
                title="Save (⌘S)"
                data-saved={!dirty && activeComponentName ? true : undefined}
                aria-label={saving ? "Saving idea" : saveLabel}
              >
                {saving ? (
                  <span className={styles.spinner} aria-hidden="true" />
                ) : !dirty && activeComponentName ? (
                  <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true">
                    <path d="M4 9.25l3.15 3.15L14 5.75" />
                  </svg>
                ) : (
                  <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true">
                    <path d="M3.5 3.5h9l2 2v9h-11zM6 3.5v4h6v-4M6 14.5v-4h6v4" />
                  </svg>
                )}
              </button>
              <button
                type="button"
                className={styles.makeLive}
                disabled={promoting || saving || !workbenchReady || !hasDraft}
                onClick={() => void onMakeLive()}
              >
                {promoting ? "Publishing…" : "Make Live"}
              </button>
            </div>
          </div>

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
