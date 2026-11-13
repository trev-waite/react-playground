import { useSyncExternalStore } from "react";
import { livePath, liveSlugFromPath } from "../lib/liveRoutes";
import { LivePage, type NavigateLive } from "./LivePage";

/** `pushState` and `replaceState` fire no event, so the app tells its own readers. */
const readers = new Set<() => void>();

function subscribe(onChange: () => void) {
  readers.add(onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    readers.delete(onChange);
    window.removeEventListener("popstate", onChange);
  };
}

function readPath() {
  return window.location.pathname;
}

const navigate: NavigateLive = (slug, how) => {
  const path = livePath(slug);
  if (path === window.location.pathname) return;
  if (how === "push") window.history.pushState(null, "", path);
  else window.history.replaceState(null, "", path);
  for (const reader of readers) reader();
};

/**
 * The deployable Live catalog. The URL path is the open card's slug, and the
 * build writes a page for every such path, so the browser's own history is the
 * router: the app only reads the path and moves it.
 */
export function LiveApp() {
  const pathname = useSyncExternalStore(subscribe, readPath);
  return <LivePage slug={liveSlugFromPath(pathname)} onNavigate={navigate} documentScroll />;
}
