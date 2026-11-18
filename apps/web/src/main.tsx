import { StrictMode, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { gridLayout } from "./app/deck/deckLayout";
import { nearCards } from "./app/deck/mountPolicy";
import { cardIndexForSlug } from "./lib/catalog";
import { liveCards } from "./lib/liveCatalog";
import { liveSlugFromPath } from "./lib/liveRoutes";
import { LiveApp } from "./app/LiveApp";
import { installMotionProperties } from "./app/motion/cssMotion";
import { installTheme } from "./app/theme/theme";
import "./app/app.css";

if (import.meta.env.PROD) {
  const cards = liveCards();
  const open = cardIndexForSlug(cards, liveSlugFromPath(location.pathname));
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const indices = open >= 0 ? [open] : nearCards({
    layout: "grid",
    grid: { ...gridLayout(cards.map(card => card.size), viewport), top: 0, height: viewport.height },
  }, cards.length);
  for (const index of indices) {
    for (const member of cards[index]!.members) member.load().catch(() => {});
  }
}

installMotionProperties(document.documentElement);
installTheme();

// The studio needs the dev server and local API, so builds ship the Live app alone.
const App: ComponentType = import.meta.env.DEV
  ? (await import("./studio/StudioApp")).StudioApp
  : LiveApp;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
