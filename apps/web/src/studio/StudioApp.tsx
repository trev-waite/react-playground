import { BrowserRouter, Route, Routes } from "react-router";
import { LivePage } from "../app/LivePage";
import { ExperimentalPage } from "../experimental/ExperimentalPage";
import { FrostOverlay, liveLayerMaskStyle } from "./DiagonalBandMask";
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

function ViewStack() {
  const { progress, mode, liveSlug, reducedMotion, reducedTransparency } = useView();

  const liveStyle = liveLayerMaskStyle(progress, {
    reducedMotion,
  });

  return (
    <div className={styles.shell}>
      <div className={styles.stack}>
        <div
          className={styles.layer}
          data-layer="experimental"
          aria-hidden={mode !== "experimental"}
          inert={mode !== "experimental" ? true : undefined}
          style={{
            pointerEvents: mode === "experimental" ? "auto" : "none",
            zIndex: 1,
          }}
        >
          <ExperimentalPage active={mode === "experimental"} />
          <FrostOverlay
            progress={progress}
            reducedMotion={reducedMotion}
            reducedTransparency={reducedTransparency}
          />
        </div>

        <div
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
        </div>
      </div>

      <ViewToggle />

      <span className={styles.srOnly} aria-live="polite">
        {mode === "live" ? "Live view" : "Experimental view"}
      </span>
    </div>
  );
}
