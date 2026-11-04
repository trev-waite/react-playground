import { useState } from "react";
import { motion } from "motion/react";
import { BrowserRouter, Route, Routes } from "react-router";
import { ChromeBar, DeckChromeSlot } from "../app/deck/DeckChrome";
import { LivePage } from "../app/LivePage";
import { REDUCED_MOTION, SPRING } from "../app/motion";
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

/** Room for Live's 44px view button and the gap before the toggle. */
const DECK_SLOT_WIDTH = 52;

function ViewStack() {
  const { progress, mode, liveSlug, reducedMotion, reducedTransparency, markExperimentalReady } =
    useView();
  const [deckSlot, setDeckSlot] = useState<HTMLElement | null>(null);
  const live = mode === "live";

  const liveStyle = useLiveLayerStyle(progress, reducedMotion);
  const experimentalStyle = useExperimentalLayerStyle(progress);

  return (
    <DeckChromeSlot.Provider value={deckSlot}>
      <div className={styles.shell}>
        <div className={styles.stack}>
          <motion.div
            className={styles.layer}
            data-layer="experimental"
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
          </motion.div>

          <motion.div
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
            <LivePage slug={liveSlug} active={mode === "live"} />
          </motion.div>
        </div>

        <ChromeBar>
          {/* Live docks its grid button here; it folds away while Experimental shows. */}
          <motion.div
            ref={setDeckSlot}
            className={styles.deckSlot}
            initial={false}
            animate={{ width: live ? DECK_SLOT_WIDTH : 0, opacity: live ? 1 : 0, scale: live ? 1 : 0.6 }}
            transition={reducedMotion ? REDUCED_MOTION : SPRING.panel}
            inert={live ? undefined : true}
          />
          <ViewToggle />
        </ChromeBar>

        <span className={styles.srOnly} aria-live="polite">
          {mode === "live" ? "Live view" : "Experimental view"}
        </span>
      </div>
    </DeckChromeSlot.Provider>
  );
}
