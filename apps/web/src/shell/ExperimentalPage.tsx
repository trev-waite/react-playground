import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  EXPERIMENTAL_FOLDER,
  SHELLS_FOLDER,
  normalizeFolder,
  toComponentName,
  type IdeaDraft,
  type IdeaProject,
  type IdeaSummary,
} from "@react-playground/api";
import { playgroundEntries } from "../lib/discover";
import type { IdeaStudioSession } from "../lib/ideaSession";
import { playgroundApi } from "../lib/playgroundApi";
import { EditSequence } from "./editSequence";
import { FolderEditor } from "./FolderEditor";
import { IdeaProjects } from "./IdeaProjects";
import { ideaIdFromPath, initialIdeaId } from "./projectSwitch";
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
  const [folder, setFolder] = useState(() => existingFolders()[0] ?? "");
  const [studioKey, setStudioKey] = useState(0);
  const [session, setSession] = useState<IdeaStudioSession>({ kind: "blank" });
  const [ideas, setIdeas] = useState<IdeaSummary[]>([]);
  const [activeIdea, setActiveIdea] = useState<IdeaProject | null>(null);
  const [dirty, setDirty] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ideasMenuOpen, setIdeasMenuOpen] = useState(false);
  const [pickingLiveFolder, setPickingLiveFolder] = useState(false);
  const [deletingIdeaId, setDeletingIdeaId] = useState<string | null>(
    null,
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [activated, setActivated] = useState(() => mode === "experimental");
  const initialPathRef = useRef(location.pathname);
  const draftRef = useRef<IdeaDraft | null>(null);
  const editSequenceRef = useRef(new EditSequence());
  const savingRef = useRef(false);
  const applyLoadedIdeaRef = useRef<(idea: IdeaProject) => void>(() => {});
  const saveIdeaRef = useRef<() => Promise<IdeaProject | null>>(async () => null);
  const switchToRef = useRef<(next: string) => Promise<void>>(async () => {});
  const workbenchReady = hydrated;

  const componentName = toComponentName(ideaName.trim() || DEFAULT_IDEA_NAME);
  const errorMessage = saveError ?? promoteError;
  const canSave =
    workbenchReady &&
    hasDraft &&
    (dirty || !activeIdea) &&
    !saving;
  const markDirty = useCallback(() => {
    editSequenceRef.current.mark();
    setDirty(true);
  }, []);
  const displayedIdeas = useMemo(
    () =>
      ideas.map(idea =>
        idea.id === activeIdea?.id ? { ...idea, name: ideaName } : idea,
      ),
    [activeIdea?.id, ideaName, ideas],
  );

  const applyLoadedIdea = useCallback(
    (idea: IdeaProject) => {
      setIdeaName(idea.name);
      setFolder(idea.targetFolder);
      setActiveIdea(idea);
      draftRef.current = idea.draft;
      editSequenceRef.current.reset();
      setSession(
        idea.draft.kind === "emerald-construct"
          ? { kind: "restore", editorState: idea.draft.editorState }
          : { kind: "blank" },
      );
      setHasDraft(true);
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

  function resetToBlank() {
    setIdeaName(DEFAULT_IDEA_NAME);
    setFolder(existingFolders()[0] ?? "");
    setActiveIdea(null);
    draftRef.current = null;
    editSequenceRef.current.reset();
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

        const ideaToOpen = initialIdeaId(
          initialPathRef.current,
          listed,
        );
        if (!ideaToOpen) return;

        const loadedIdea = await playgroundApi.loadIdea(ideaToOpen);
        if (cancelled) return;
        applyLoadedIdeaRef.current(loadedIdea);
        navigate(`/experimental/${loadedIdea.id}`, { replace: true });
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

  async function saveIdea(nextFolder = folder): Promise<IdeaProject | null> {
    if (savingRef.current) return null;
    const draft = draftRef.current;
    if (!draft?.portableSourceTemplate.trim()) {
      setSaveError("Nothing to save yet");
      return null;
    }
    const targetFolder = normalizeFolder(nextFolder);
    if (!targetFolder) {
      setSaveError("Choose a Live folder");
      return null;
    }

    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    const savedEditVersion = editSequenceRef.current.capture();
    const input = {
      name: ideaName,
      targetFolder,
      draft,
    };

    try {
      const saved = activeIdea
        ? await playgroundApi.updateIdea(activeIdea.id, {
            ...input,
            expectedRevision: activeIdea.revision,
          })
        : await playgroundApi.createIdea(input);
      setActiveIdea(saved);
      setIdeas(current => [
        {
          id: saved.id,
          revision: saved.revision,
          name: saved.name,
          targetFolder: saved.targetFolder,
          componentName: saved.componentName,
          updatedAt: saved.updatedAt,
        },
        ...current.filter(idea => idea.id !== saved.id),
      ]);
      if (editSequenceRef.current.isCurrent(savedEditVersion)) {
        setIdeaName(saved.name);
        setFolder(saved.targetFolder);
        setDirty(false);
      }
      navigate(`/experimental/${saved.id}`, { replace: true });
      return saved;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
      return null;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  saveIdeaRef.current = saveIdea;

  async function persistIfDirty(): Promise<boolean> {
    if (savingRef.current) return false;
    if (!dirty) return true;
    const draft = draftRef.current;
    if (!draft?.portableSourceTemplate.trim()) {
      setSaveError("Nothing to save yet");
      return false;
    }
    return (await saveIdea()) != null;
  }

  async function switchTo(next: string) {
    if (savingRef.current) return;
    if (next === activeIdea?.id) return;
    if (!(await persistIfDirty())) return;
    try {
      applyLoadedIdea(await playgroundApi.loadIdea(next));
      navigate(`/experimental/${next}`, { replace: true });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not open project");
    }
  }
  switchToRef.current = switchTo;

  async function startNewIdea() {
    if (savingRef.current) return;
    if (!(await persistIfDirty())) return;
    resetToBlank();
  }

  useEffect(() => {
    if (!hydrated) return;
    const fromUrl = ideaIdFromPath(location.pathname);
    if (!fromUrl) return;
    void switchToRef.current(fromUrl);
  }, [hydrated, location.pathname]);

  async function onDelete(ideaIdToDelete: string) {
    if (savingRef.current) return;
    const idea = displayedIdeas.find(
      item => item.id === ideaIdToDelete,
    );
    if (!idea) return;
    const confirmed = window.confirm(
      `Delete experimental project “${idea.name}”? This cannot be undone.`,
    );
    if (!confirmed) return;

    setSaveError(null);
    setDeletingIdeaId(ideaIdToDelete);
    try {
      await playgroundApi.deleteIdea(ideaIdToDelete);
      setIdeas(current => current.filter(item => item.id !== ideaIdToDelete));
      if (ideaIdToDelete === activeIdea?.id) resetToBlank();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not delete project");
    } finally {
      setDeletingIdeaId(null);
    }
  }

  async function onMakeLive() {
    if (!componentName) {
      setSaveError("Name the idea before publishing");
      return;
    }
    setSaveError(null);
    setIdeasMenuOpen(false);
    setPickingLiveFolder(true);
  }

  async function publishToFolder(nextFolder: string) {
    const targetFolder = normalizeFolder(nextFolder);
    if (!targetFolder || !componentName) {
      setSaveError("Choose a Live folder");
      return;
    }

    const saved =
      dirty || !activeIdea || folder !== targetFolder
        ? await saveIdea(targetFolder)
        : activeIdea;
    if (!saved) return;
    setPickingLiveFolder(false);
    await promote(saved.id, { expectedRevision: saved.revision });
  }

  useEffect(() => {
    if (!pickingLiveFolder) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setPickingLiveFolder(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pickingLiveFolder]);

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

  const saveLabel = !dirty && activeIdea ? "Saved" : "Save";

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
              ideaName={ideaName}
              activeIdeaId={activeIdea?.id ?? null}
              open={ideasMenuOpen}
              disabled={
                !workbenchReady || saving || promoting || deletingIdeaId != null
              }
              deletingIdeaId={deletingIdeaId}
              onIdeaNameChange={name => {
                setIdeaName(name);
                markDirty();
              }}
              onOpenChange={setIdeasMenuOpen}
              onOpen={name => void switchTo(name)}
              onNew={() => void startNewIdea()}
              onDelete={name => void onDelete(name)}
            />

            <div
              className={styles.editorActions}
              inert={ideasMenuOpen ? true : undefined}
              aria-hidden={ideasMenuOpen || undefined}
            >
              <button
                type="button"
                className={`${styles.iconButton} ${styles.delete}`}
                onClick={() => {
                  if (activeIdea) void onDelete(activeIdea.id);
                }}
                disabled={
                  !activeIdea ||
                  saving ||
                  promoting ||
                  deletingIdeaId != null
                }
                aria-label={deletingIdeaId ? "Deleting idea" : "Delete idea"}
                title="Delete idea"
              >
                {deletingIdeaId ? (
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
                data-saved={!dirty && activeIdea ? true : undefined}
                aria-label={saving ? "Saving idea" : saveLabel}
              >
                {saving ? (
                  <span className={styles.spinner} aria-hidden="true" />
                ) : !dirty && activeIdea ? (
                  <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true">
                    <path d="M4 9.25l3.15 3.15L14 5.75" />
                  </svg>
                ) : (
                  <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true">
                    <path d="M3.5 3.5h9l2 2v9h-11zM6 3.5v4h6v-4M6 14.5v-4h6v4" />
                  </svg>
                )}
              </button>
              <div className={styles.makeLiveHost}>
                {pickingLiveFolder ? (
                  <div
                    className={styles.makeLiveBackdrop}
                    aria-hidden="true"
                    onClick={() => setPickingLiveFolder(false)}
                  />
                ) : null}
                {pickingLiveFolder ? (
                  <div
                    className={styles.makeLivePanel}
                    role="dialog"
                    aria-label="Choose Live folder"
                  >
                    <FolderEditor
                      folders={folders}
                      initialFolder={folder}
                      submitLabel="Publish"
                      destinationHint={`apps/web/src/live/<folder>/${componentName}/`}
                      onCancel={() => setPickingLiveFolder(false)}
                      onSubmit={nextFolder => void publishToFolder(nextFolder)}
                    />
                  </div>
                ) : null}
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
                onDraftChange={draft => {
                  if (!draft && activeIdea?.draft.kind === "source") return;
                  draftRef.current = draft;
                  setHasDraft(Boolean(draft));
                }}
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
