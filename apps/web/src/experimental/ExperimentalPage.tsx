import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useLocation, useNavigate } from "react-router";
import {
  EXPERIMENTAL_FOLDER,
  SHELLS_FOLDER,
  bakeSliders,
  defaultIdeaDraft,
  normalizeFolder,
  toComponentName,
  type IdeaDraft,
  type IdeaProject,
  type IdeaSummary,
} from "@react-playground/api";
import { Canvas } from "../app/Canvas";
import { EdgePanel, STUDIO_RAIL_WIDTH } from "../app/EdgePanel";
import { useView } from "../app/view/ViewController";
import type { PlaygroundEntry } from "../lib/types";
import { emptyIdeaDraft } from "../lib/ideaSession";
import { playgroundApi } from "../lib/playgroundApi";
import { EditSequence } from "./editSequence";
import { FolderEditor } from "./FolderEditor";
import { IdeaProjects } from "./IdeaProjects";
import { ideaIdFromPath, initialIdeaId } from "./projectSwitch";
import { useIdeaPublishing } from "./useIdeaPublishing";
import { useIdeaSync } from "./useIdeaSync";
import styles from "./ExperimentalPage.module.css";

const IdeaWorkbench = lazy(() => import("./IdeaWorkbench"));

const DEFAULT_IDEA_NAME = "Untitled idea";

function liveFolders(liveEntries: PlaygroundEntry[]) {
  const folders = new Set<string>();
  for (const entry of liveEntries) {
    const [folder] = entry.slug.split("/");
    if (folder && folder !== SHELLS_FOLDER && folder !== EXPERIMENTAL_FOLDER) {
      folders.add(folder);
    }
  }
  return [...folders].sort((a, b) => a.localeCompare(b));
}

function publishedLiveEntry(componentName: string | null, liveEntries: PlaygroundEntry[]) {
  if (!componentName) return null;
  return (
    liveEntries.find(entry => {
      const segments = entry.slug.split("/");
      const folder = segments[0];
      const name = segments.at(-1);
      return (
        name === componentName &&
        folder !== SHELLS_FOLDER &&
        folder !== EXPERIMENTAL_FOLDER
      );
    }) ?? null
  );
}

export function ExperimentalPage() {
  const { mode, liveEntries } = useView();
  const folders = useMemo(() => liveFolders(liveEntries), [liveEntries]);
  const {
    publish,
    publishing,
    publishError,
    clearPublishError,
  } = useIdeaPublishing();
  const location = useLocation();
  const navigate = useNavigate();

  const [ideaName, setIdeaName] = useState(DEFAULT_IDEA_NAME);
  const [liveFolder, setLiveFolder] = useState(folders[0] ?? "");
  const [studioKey, setStudioKey] = useState(0);
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
  const showIdeaRef = useRef<(idea: IdeaProject) => void>(() => {});
  const saveIdeaRef = useRef<() => Promise<IdeaProject | null>>(async () => null);
  const switchToRef = useRef<(next: string) => Promise<void>>(async () => {});
  const activeIdRef = useRef<string | null>(null);
  const makeLivePanelRef = useRef<HTMLDivElement>(null);
  const makeLiveHostRef = useRef<HTMLDivElement>(null);
  const makeLivePanelId = useId();
  const [makeLivePanelHeight, setMakeLivePanelHeight] = useState(0);

  const componentName = toComponentName(ideaName.trim() || DEFAULT_IDEA_NAME);
  const errorMessage = saveError ?? publishError;
  const canSave =
    hydrated &&
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

  function rememberIdea(idea: IdeaProject) {
    setIdeas(current => [
      {
        id: idea.id,
        revision: idea.revision,
        name: idea.name,
        componentName: idea.componentName,
        updatedAt: idea.updatedAt,
      },
      ...current.filter(item => item.id !== idea.id),
    ]);
  }

  function showIdea(idea: IdeaProject, open = true) {
    setIdeaName(idea.name);
    setActiveIdea(idea);
    activeIdRef.current = idea.id;
    draftRef.current = idea.draft;
    editSequenceRef.current.reset();
    setHasDraft(true);
    setDirty(false);
    setSaveError(null);
    const publishedFolder = publishedLiveEntry(idea.componentName, liveEntries)?.slug.split(
      "/",
    )[0];
    if (publishedFolder) setLiveFolder(publishedFolder);
    setStudioKey(key => key + 1);
    if (open) navigate(`/experimental/${idea.id}`, { replace: true });
  }
  showIdeaRef.current = showIdea;

  function clearStudio(open = true) {
    setIdeaName(DEFAULT_IDEA_NAME);
    setLiveFolder(folders[0] ?? "");
    setActiveIdea(null);
    activeIdRef.current = null;
    draftRef.current = null;
    editSequenceRef.current.reset();
    setDirty(false);
    setHasDraft(false);
    setSaveError(null);
    setStudioKey(key => key + 1);
    if (open) navigate("/experimental", { replace: true });
  }

  const disk = useIdeaSync({
    enabled: hydrated,
    activeIdea,
    dirty,
    busy: saving || publishing || deletingIdeaId != null,
    editVersion: editSequenceRef.current.capture(),
    onList: setIdeas,
    onReload: idea => showIdea(idea, false),
    onDeleted: () => clearStudio(mode === "experimental"),
    onError: setSaveError,
  });

  useEffect(() => {
    if (mode === "experimental") setActivated(true);
  }, [mode]);

  useEffect(() => {
    if (!activated) return;
    let cancelled = false;

    void (async () => {
      try {
        const listed = await playgroundApi.listIdeas();
        if (cancelled) return;
        setIdeas(listed);
        if (activeIdRef.current) return;

        const ideaToOpen = initialIdeaId(initialPathRef.current, listed);
        if (!ideaToOpen) return;

        const loadedIdea = await playgroundApi.loadIdea(ideaToOpen);
        if (cancelled || activeIdRef.current) return;
        showIdeaRef.current(loadedIdea);
      } catch {
        if (!cancelled) setSaveError("Could not load saved projects");
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activated]);

  async function saveIdea(
    options: { open?: boolean } = {},
  ): Promise<IdeaProject | null> {
    if (savingRef.current) return null;
    const draft = draftRef.current;
    if (!draft?.portableSourceTemplate.trim()) {
      setSaveError("Nothing to save yet");
      return null;
    }
    const baked: IdeaDraft = {
      ...draft,
      portableSourceTemplate: bakeSliders(
        draft.portableSourceTemplate,
        draft.sliders,
      ),
    };
    draftRef.current = baked;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    const savedEditVersion = editSequenceRef.current.capture();
    const input = {
      name: ideaName,
      draft: baked,
    };

    try {
      const saved = activeIdea
        ? await playgroundApi.updateIdea(activeIdea.id, {
            ...input,
            expectedRevision: activeIdea.revision,
          })
        : await playgroundApi.createIdea(input);
      setActiveIdea(saved);
      activeIdRef.current = saved.id;
      rememberIdea(saved);
      if (editSequenceRef.current.isCurrent(savedEditVersion)) {
        setIdeaName(saved.name);
        setDirty(false);
      }
      if (options.open !== false) {
        navigate(`/experimental/${saved.id}`, { replace: true });
      }
      return saved;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
      return null;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  saveIdeaRef.current = () => saveIdea();

  async function persistIfDirty(): Promise<boolean> {
    if (savingRef.current) return false;
    if (!dirty) return true;
    if (!draftRef.current?.portableSourceTemplate.trim()) return true;
    return (await saveIdea({ open: false })) != null;
  }

  async function switchTo(next: string) {
    if (savingRef.current) return;
    if (next === activeIdRef.current) return;
    if (!(await persistIfDirty())) return;
    try {
      showIdea(await playgroundApi.loadIdea(next));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not open project");
    }
  }
  switchToRef.current = switchTo;

  async function startNewIdea(name: string) {
    const nextName = name.trim();
    if (!nextName || savingRef.current) return;
    if (!(await persistIfDirty())) return;

    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const created = await playgroundApi.createIdea({
        name: nextName,
        draft: defaultIdeaDraft(),
      });
      rememberIdea(created);
      showIdea(created);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not create idea");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!hydrated) return;
    const fromUrl = ideaIdFromPath(location.pathname);
    if (!fromUrl || fromUrl === activeIdRef.current) return;
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
      const remaining = ideas.filter(item => item.id !== ideaIdToDelete);
      setIdeas(remaining);
      if (ideaIdToDelete !== activeIdea?.id) return;
      const fallback = remaining[0];
      if (fallback) showIdea(await playgroundApi.loadIdea(fallback.id));
      else clearStudio();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not delete project");
    } finally {
      setDeletingIdeaId(null);
    }
  }

  function onMakeLive() {
    if (!componentName) {
      setSaveError("Name the idea before publishing");
      return;
    }
    setSaveError(null);
    clearPublishError();
    setIdeasMenuOpen(false);
    setPickingLiveFolder(true);
  }

  async function publishToFolder(nextFolder: string) {
    const targetFolder = normalizeFolder(nextFolder);
    if (!targetFolder || !componentName) {
      setSaveError("Choose a Live folder");
      return;
    }

    const saved = dirty || !activeIdea ? await saveIdea() : activeIdea;
    if (!saved) return;
    setLiveFolder(targetFolder);
    setPickingLiveFolder(false);
    await publish(saved.id, {
      expectedRevision: saved.revision,
      targetFolder,
    });
  }

  useEffect(() => {
    if (!pickingLiveFolder) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setPickingLiveFolder(false);
    }
    function onPointerDown(event: PointerEvent) {
      if (makeLiveHostRef.current?.contains(event.target as Node)) return;
      setPickingLiveFolder(false);
    }
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [pickingLiveFolder]);

  useLayoutEffect(() => {
    const panel = makeLivePanelRef.current;
    if (!panel) return;
    const measure = () => setMakeLivePanelHeight(panel.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

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
  const alreadyLive = publishedLiveEntry(componentName, liveEntries) != null;
  const makeLiveLabel = alreadyLive ? "Update Live" : "Make Live";

  const toolbar = (
    <div
      className={styles.identity}
      data-loading={!hydrated || undefined}
      aria-busy={!hydrated}
      inert={!hydrated ? true : undefined}
    >
      <div className={styles.toolbar}>
        <div className={styles.toolbarRow}>
          <IdeaProjects
            ideas={displayedIdeas}
            ideaName={ideaName}
            activeIdeaId={activeIdea?.id ?? null}
            open={ideasMenuOpen}
            disabled={
              !hydrated || saving || publishing || deletingIdeaId != null
            }
            deletingIdeaId={deletingIdeaId}
            onIdeaNameChange={name => {
              setIdeaName(name);
              markDirty();
            }}
            onOpenChange={setIdeasMenuOpen}
            onOpen={name => void switchTo(name)}
            onNew={name => void startNewIdea(name)}
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
                publishing ||
                deletingIdeaId != null
              }
              aria-label={deletingIdeaId ? "Deleting idea" : "Delete idea"}
              title="Delete idea"
            >
              {deletingIdeaId ? (
                <span className={styles.spinner} aria-hidden="true" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
                  <path d="M3.75 5.25h10.5M7 5.25V3.5h4v1.75M5.25 5.25l.65 9.25h6.2l.65-9.25M7.5 7.75v4.5M10.5 7.75v4.5" />
                </svg>
              )}
            </button>
            <button
              type="button"
              className={`${styles.iconButton} ${styles.save}`}
              onClick={() => void saveIdea()}
              disabled={!canSave || disk.change != null}
              title="Save (⌘S)"
              data-saved={!dirty && activeIdea ? true : undefined}
              aria-label={saving ? "Saving idea" : saveLabel}
            >
              {saving ? (
                <span className={styles.spinner} aria-hidden="true" />
              ) : !dirty && activeIdea ? (
                <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
                  <path d="M4 9.25l3.15 3.15L14 5.75" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
                  <path d="M3.5 3.5h9l2 2v9h-11zM6 3.5v4h6v-4M6 14.5v-4h6v4" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div
          ref={makeLiveHostRef}
          className={styles.makeLiveHost}
          data-open={pickingLiveFolder || undefined}
          inert={ideasMenuOpen ? true : undefined}
          aria-hidden={ideasMenuOpen || undefined}
        >
          <div
            className={styles.makeLiveSurface}
            data-open={pickingLiveFolder || undefined}
            style={
              makeLivePanelHeight > 0
                ? ({
                    "--make-live-panel-height": `${makeLivePanelHeight}px`,
                  } as CSSProperties)
                : undefined
            }
          >
            <div
              id={makeLivePanelId}
              className={styles.makeLivePanel}
              ref={makeLivePanelRef}
              role="dialog"
              aria-label="Choose Live folder"
              inert={pickingLiveFolder ? undefined : true}
            >
              <FolderEditor
                folders={folders}
                initialFolder={liveFolder}
                autoFocus={pickingLiveFolder}
                tone="dark"
                submitLabel={alreadyLive ? "Update" : "Publish"}
                destinationHint={`apps/web/src/live/<folder>/${componentName}/`}
                onCancel={() => setPickingLiveFolder(false)}
                onSubmit={nextFolder => void publishToFolder(nextFolder)}
              />
            </div>
          </div>
          <button
            type="button"
            className={styles.makeLive}
            disabled={publishing || saving || !hydrated || !hasDraft || disk.change != null}
            aria-expanded={pickingLiveFolder}
            aria-controls={makeLivePanelId}
            onClick={() => {
              if (pickingLiveFolder) setPickingLiveFolder(false);
              else onMakeLive();
            }}
          >
            {publishing
              ? alreadyLive
                ? "Updating…"
                : "Publishing…"
              : makeLiveLabel}
          </button>
        </div>
      </div>

      {disk.change && (
        <p className={styles.error} role="alert">
          {disk.change === "deleted"
            ? "This project was deleted on disk. Your unsaved edits are still here."
            : "This project changed on disk. Your unsaved edits are still here."}
          {disk.change === "updated" ? (
            <button type="button" onClick={disk.reload}>Discard edits and reload</button>
          ) : (
            <button type="button" onClick={() => {
              setActiveIdea(null);
              activeIdRef.current = null;
              markDirty();
              navigate("/experimental", { replace: true });
            }}>Keep as a new idea</button>
          )}
        </p>
      )}

      {errorMessage ? (
        <p className={styles.error} role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );

  return (
    <div className={styles.page}>
      <Suspense
        fallback={
          <Canvas>
            <p className={styles.status}>Loading…</p>
          </Canvas>
        }
      >
        {hydrated ? (
          <IdeaWorkbench
            key={studioKey}
            componentName={activeIdea?.componentName ?? null}
            draft={draftRef.current ?? emptyIdeaDraft}
            onMutate={markDirty}
            onDraftChange={next => {
              draftRef.current = next;
              setHasDraft(true);
            }}
          >
            {({ stage, dock }) => (
              <>
                <Canvas>{stage}</Canvas>
                <EdgePanel
                  side="right"
                  label="Studio controls"
                  width={STUDIO_RAIL_WIDTH}
                  defaultOpen
                  reveal="toggle"
                  enabled={mode === "experimental"}
                >
                  <div className={styles.rail}>
                    <header className={styles.railHeader}>{toolbar}</header>
                    {dock}
                  </div>
                </EdgePanel>
              </>
            )}
          </IdeaWorkbench>
        ) : (
          <Canvas>
            <p className={styles.status}>Loading…</p>
          </Canvas>
        )}
      </Suspense>
    </div>
  );
}
