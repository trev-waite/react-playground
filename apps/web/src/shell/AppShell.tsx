import { ExperimentalPage } from "./ExperimentalPage";
import { LivePage } from "./LivePage";
import { FrostOverlay, liveLayerMaskStyle } from "./view/DiagonalBandMask";
import { ViewProvider, useView } from "./view/ViewController";
import { ViewToggle } from "./view/ViewToggle";
import "./shell.css";
import styles from "./AppShell.module.css";

function ViewStack() {
  const {
    progress,
    mode,
    reducedMotion,
    reducedTransparency,
  } = useView();

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
          <ExperimentalPage />
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
          <LivePage />
        </div>
      </div>

      <ViewToggle />

      <span className={styles.srOnly} aria-live="polite">
        {mode === "live" ? "Live view" : "Experimental view"}
      </span>
    </div>
  );
}

export function AppShell() {
  return (
    <ViewProvider>
      <ViewStack />
    </ViewProvider>
  );
}

export { Canvas } from "./Canvas";
