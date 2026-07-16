import { lazy, Suspense } from "react";
import { useLocation } from "react-router";
import { entriesBySlug, playgroundEntries } from "../lib/discover";
import { Canvas } from "./Canvas";
import styles from "./ExperimentStage.module.css";

const lazyPreviews = new Map(
  playgroundEntries.map(entry => [
    entry.slug,
    lazy(() =>
      entry.load().then(mod => ({
        default: mod.default,
      })),
    ),
  ]),
);

export function EmptyStage() {
  return <Canvas empty />;
}

export function ExperimentStage() {
  const location = useLocation();
  const slug = location.pathname.replace(/^\//, "").replace(/\/$/, "");
  const entry = slug ? entriesBySlug.get(slug) : undefined;
  const Preview = slug ? lazyPreviews.get(slug) : undefined;

  if (!entry || !Preview) {
    return (
      <Canvas>
        <p className={styles.missing}>No experiment at “{slug || "/"}”.</p>
      </Canvas>
    );
  }

  return (
    <Canvas>
      <Suspense fallback={<p className={styles.loading}>Loading…</p>}>
        <div className={styles.frame}>
          <Preview />
        </div>
      </Suspense>
    </Canvas>
  );
}
