import { startTransition, useEffect, useState } from "react";
import { liveSlugFromPath } from "../lib/catalog";
import { LivePage } from "./LivePage";

/** The deployable Live catalog: one page, the URL path is the component slug. */
export function LiveApp() {
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPopState = () => startTransition(() => setPathname(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function replacePath(path: string) {
    window.history.replaceState(null, "", path);
    // A transition, like a router navigation, so the deck can zoom in the same commit.
    startTransition(() => setPathname(path));
  }

  return <LivePage slug={liveSlugFromPath(pathname)} onNavigate={replacePath} documentScroll />;
}
