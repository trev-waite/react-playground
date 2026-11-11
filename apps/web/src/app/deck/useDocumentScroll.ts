import { useLayoutEffect, useSyncExternalStore } from "react";

/** Matches the knight site's mobile layout boundary. */
const PHONE_QUERY = "(max-width: 768px)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function isPhone() {
  return window.matchMedia(PHONE_QUERY).matches;
}

/**
 * On phones the deck scrolls the document instead of its own scroller. Safari
 * only draws its toolbars as glass over the page when the document scrolls;
 * an inner scroller gets solid bars. Marks the root so the page styles follow.
 */
export function useDocumentScroll(enabled: boolean): boolean {
  const phone = useSyncExternalStore(subscribe, isPhone);
  const active = enabled && phone;

  useLayoutEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    const restoration = history.scrollRestoration;
    root.dataset.scroll = "document";
    // The deck places the scroll itself; a restored offset would land between pages.
    history.scrollRestoration = "manual";
    return () => {
      delete root.dataset.scroll;
      history.scrollRestoration = restoration;
    };
  }, [active]);

  return active;
}
