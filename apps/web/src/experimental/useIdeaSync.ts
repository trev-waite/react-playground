import { useEffect, useRef, useState } from "react";
import type { IdeaProject, IdeaSummary } from "@react-playground/api";
import { IDEAS_CHANGED } from "../lib/liveCatalogPath";
import { playgroundApi } from "../lib/playgroundApi";

type Options = {
  enabled: boolean;
  activeIdea: IdeaProject | null;
  dirty: boolean;
  editVersion: number;
  busy: boolean;
  onList: (ideas: IdeaSummary[]) => void;
  onReload: (idea: IdeaProject) => void;
  onDeleted: () => void;
  onError: (message: string) => void;
};

export function useIdeaSync(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const [change, setChange] = useState<"updated" | "deleted" | null>(null);
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => { setChange(null); }, [options.activeIdea?.id]);

  useEffect(() => {
    if (!options.enabled || !import.meta.hot) return;
    const hot = import.meta.hot;
    let sequence = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function refresh(discard = false) {
      const request = ++sequence;
      clearTimeout(timer);
      if (latest.current.busy) {
        timer = setTimeout(() => void refresh(discard), 100);
        return;
      }
      const active = latest.current.activeIdea;
      const editVersion = latest.current.editVersion;
      try {
        const ideas = await playgroundApi.listIdeas();
        if (request !== sequence) return;
        latest.current.onList(ideas);
        if (!active) return;
        const exists = ideas.some(idea => idea.id === active.id);
        const loaded = exists ? await playgroundApi.loadIdea(active.id) : null;
        if (request !== sequence || latest.current.activeIdea?.id !== active.id) return;
        if (latest.current.busy) {
          timer = setTimeout(() => void refresh(), 100);
          return;
        }
        if (loaded && JSON.stringify(loaded) === JSON.stringify(latest.current.activeIdea)) {
          setChange(null);
          return;
        }
        if (latest.current.dirty && (!discard || latest.current.editVersion !== editVersion)) {
          setChange(loaded ? "updated" : "deleted");
        } else {
          setChange(null);
          if (loaded) latest.current.onReload(loaded);
          else latest.current.onDeleted();
        }
      } catch (error) {
        if (request === sequence) latest.current.onError(
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
      sequence += 1;
      clearTimeout(timer);
      hot.off(IDEAS_CHANGED, onChange);
      hot.off("vite:ws:connect", onChange);
      window.removeEventListener("focus", onFocus);
    };
  }, [options.enabled]);

  return { change, reload: () => refreshRef.current() };
}
