import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { IdeaProject, IdeaSummary } from "@react-playground/api";
import { IDEAS_CHANGED } from "../lib/liveCatalogPath";
import { playgroundApi } from "../lib/playgroundApi";

type Options = {
  enabled: boolean;
  activeIdea: IdeaProject | null;
  dirty: boolean;
  /** The edit sequence now; read when a refresh starts and again before it overwrites edits. */
  editVersion: () => number;
  busy: boolean;
  onList: (ideas: IdeaSummary[]) => void;
  onReload: (idea: IdeaProject) => void;
  onDeleted: () => void;
  onError: (message: string) => void;
};

type IdeaChange = "updated" | "deleted" | null;

/** Refreshes the saved ideas when the server or the window says they may have changed. */
function syncIdeas(
  hot: NonNullable<ImportMeta["hot"]>,
  latest: RefObject<Options>,
  refreshRef: RefObject<() => void>,
  setChange: (change: IdeaChange) => void,
): () => void {  const sync: { sequence: number; timer: ReturnType<typeof setTimeout> | undefined } = {
    sequence: 0,
    timer: undefined,
  };

  async function refresh(discard = false) {
    sync.sequence += 1;
    const request = sync.sequence;
    clearTimeout(sync.timer);
    if (latest.current.busy) {
      sync.timer = setTimeout(() => void refresh(discard), 100);
      return;
    }
    const active = latest.current.activeIdea;
    const editVersion = latest.current.editVersion();
    try {
      const ideas = await playgroundApi.listIdeas();
      if (request !== sync.sequence) return;
      latest.current.onList(ideas);
      if (!active) return;
      const exists = ideas.some(idea => idea.id === active.id);
      const loaded = exists ? await playgroundApi.loadIdea(active.id) : null;
      if (request !== sync.sequence || latest.current.activeIdea?.id !== active.id) return;
      if (latest.current.busy) {
        sync.timer = setTimeout(() => void refresh(), 100);
        return;
      }
      if (loaded && JSON.stringify(loaded) === JSON.stringify(latest.current.activeIdea)) {
        setChange(null);
        return;
      }
      if (latest.current.dirty && (!discard || latest.current.editVersion() !== editVersion)) {
        setChange(loaded ? "updated" : "deleted");
      } else {
        setChange(null);
        if (loaded) latest.current.onReload(loaded);
        else latest.current.onDeleted();
      }
    } catch (error) {
      if (request === sync.sequence) latest.current.onError(
        error instanceof Error ? error.message : "Could not refresh saved projects.",
      );
    }
  }

  const onChange = () => { void refresh(); };
  const onFocus = () => { void refresh(); };
  refreshRef.current = () => { void refresh(true); };
  hot.on(IDEAS_CHANGED, onChange);
  hot.on("vite:ws:connect", onChange);
  window.addEventListener("focus", onFocus);
  return () => {
    sync.sequence += 1;
    clearTimeout(sync.timer);
    hot.off(IDEAS_CHANGED, onChange);
    hot.off("vite:ws:connect", onChange);
    window.removeEventListener("focus", onFocus);
  };
}

export function useIdeaSync(options: Options) {
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  const [change, setChange] = useState<IdeaChange>(null);
  const activeId = options.activeIdea?.id;
  const [changeFor, setChangeFor] = useState(activeId);
  if (changeFor !== activeId) {
    setChangeFor(activeId);
    setChange(null);
  }
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!options.enabled || !import.meta.hot) return;
    const hot = import.meta.hot;
    return syncIdeas(hot, latest, refreshRef, setChange);
  }, [options.enabled]);

  return { change, reload: () => refreshRef.current() };
}
