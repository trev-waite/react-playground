import { lazy, Suspense, useMemo } from "react";
import { livePreviewLoader } from "../lib/discover";
import { reloadLiveCatalog } from "../lib/liveCatalog";
import { Canvas } from "./Canvas";
import styles from "./LiveStage.module.css";

type LiveStageProps = {
  slug?: string | null;
};

export function LiveStage({ slug: slugProp }: LiveStageProps) {
  const slug = slugProp ?? null;
  const Preview = useMemo(() => {
    const load = livePreviewLoader(slug);
    if (!load) return undefined;
    return lazy(() =>
      load().then(module => ({
        default: module.default,
      })),
    );
  }, [slug]);

  if (!slug) {
    return <Canvas empty />;
  }

  if (!Preview) {
    return (
      <Canvas>
        <div className={styles.missingBlock}>
          <p className={styles.missing}>No Live component at “{slug}”.</p>
          <button
            type="button"
            className={styles.refresh}
            onClick={() => void reloadLiveCatalog()}
          >
            Refresh catalog
          </button>
        </div>
      </Canvas>
    );
  }

  return (
    <Canvas>
      <Suspense fallback={<p className={styles.loading}>Loading…</p>}>
        {/* `.frame` must stretch: `useGpu` waits for a real canvas layout. */}
        <div className={styles.frame}>
          <Preview />
        </div>
      </Suspense>
    </Canvas>
  );
}
