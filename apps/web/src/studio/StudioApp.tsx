import { useCallback, useRef, useState } from "react";
import { BrowserRouter, Route, Routes, useNavigate } from "react-router";
import { BackPill, ChromeBar, DeckChromeSlot, ThemeButton } from "../app/deck/DeckChrome";
import { LivePage } from "../app/LivePage";
import { opacity, px, transform, useAnimatedValues, useMotionStyle } from "../app/motion/hooks";
import { REDUCED_MOTION, SPRING } from "../app/motion/transitions";
import { ExperimentalPage } from "../experimental/ExperimentalPage";
import { FrostOverlay, useExperimentalLayerStyle, useLiveLayerStyle } from "./DiagonalBandMask";
import { ViewProvider, useView } from "./ViewController";
import { ViewToggle } from "./ViewToggle";
import styles from "./StudioApp.module.css";

/**
 * Local studio: the Live app with Experimental underneath. Both views stay
 * mounted as full-page layers so the toggle can dissolve between them; routes
 * only drive URL ↔ mode and the Live slug.
 */
export function StudioApp() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="*"
          element={
            <ViewProvider>
              <ViewStack />
            </ViewProvider>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

/** Room for Live's 44px view button. */
const DECK_SLOT_WIDTH = 44;

function ViewStack() {
  const { progress, mode, liveSlug, reducedMotion, reducedTransparency, markExperimentalReady } =
    useView();
  const [deckSlot, setDeckSlot] = useState<HTMLElement | null>(null);
  const navigate = useNavigate();
  const live = mode === "live";
  const liveRef = useRef<HTMLDivElement>(null);
  const experimentalRef = useRef<HTMLDivElement>(null);

  const liveStyle = useLiveLayerStyle(liveRef, progress, reducedMotion);
  const experimentalStyle = useExperimentalLayerStyle(experimentalRef, progress);

  return (
    <DeckChromeSlot.Provider value={deckSlot}>
      <div className={styles.shell}>
        <div className={styles.stack}>
          <div
            ref={experimentalRef}
            className={styles.layer}
            data-layer="experimental"
            data-theme="light"
            data-chrome={mode === "experimental" ? "light" : undefined}
            aria-hidden={mode !== "experimental"}
            inert={mode !== "experimental" ? true : undefined}
            style={{
              ...experimentalStyle,
              pointerEvents: mode === "experimental" ? "auto" : "none",
              zIndex: 1,
            }}
          >
            <ExperimentalPage active={mode === "experimental"} onReady={markExperimentalReady} />
            <FrostOverlay progress={progress} disabled={reducedMotion || reducedTransparency} />
          </div>

          <div
            ref={liveRef}
            className={styles.layer}
            data-layer="live"
            aria-hidden={mode !== "live"}
            inert={mode !== "live" ? true : undefined}
            style={{
              ...liveStyle,
              pointerEvents: mode === "live" ? "auto" : "none",
              zIndex: 2,
            }}
          >
            <LivePage
              slug={liveSlug}
              active={mode === "live"}
              onNavigate={path => navigate(path, { replace: true })}
            />
          </div>
        </div>

        <ChromeBar>
          <BackPill>
            <DeckSlot ref={setDeckSlot} live={live} reducedMotion={reducedMotion} />
          </BackPill>
          <ViewToggle />
          <ThemeButton />
        </ChromeBar>

        <span className={styles.srOnly} aria-live="polite">
          {mode === "live" ? "Live view" : "Experimental view"}
        </span>
      </div>
    </DeckChromeSlot.Provider>
  );
}

/** Live docks its grid button here, in the back pill; it folds away while Experimental shows. */
function DeckSlot({
  ref,
  live,
  reducedMotion,
}: {
  ref: (element: HTMLDivElement | null) => void;
  live: boolean;
  reducedMotion: boolean;
}) {
  const element = useRef<HTMLDivElement | null>(null);
  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      element.current = node;
      ref(node);
    },
    [ref],
  );
  const { width, fade, scale } = useAnimatedValues(
    { width: live ? DECK_SLOT_WIDTH : 0, fade: live ? 1 : 0, scale: live ? 1 : 0.6 },
    reducedMotion ? REDUCED_MOTION : SPRING.panel,
  );
  const style = useMotionStyle(element, [width, fade, scale], style => {
    style("width", px(width.get()));
    style("opacity", opacity(fade.get()));
    style("transform", transform({ scale: scale.get() }));
  });

  return (
    <div ref={attach} className={styles.deckSlot} style={style} inert={live ? undefined : true} />
  );
}
