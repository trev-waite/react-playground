import { lazy, Suspense, useMemo } from "react";
import { livePreviewLoader } from "../lib/catalog";
import { useLiveEntries } from "../lib/liveCatalog";
import { RefreshCatalogButton } from "./RefreshCatalogButton";
import { Canvas } from "./Canvas";
import styles from "./LiveStage.module.css";

type LiveStageProps = {
  slug?: string | null;
};

export function LiveStage({ slug: slugProp }: LiveStageProps) {
  const slug = slugProp ?? null;
  const entries = useLiveEntries();
  const load = livePreviewLoader(slug, entries);
  const Preview = useMemo(() => {
    if (!load) return undefined;
    return lazy(() =>
      load().then(module => ({
        default: module.default,
      })),
    );
  }, [load]);

  if (!slug) {
    return <Canvas empty />;
  }

  if (!Preview) {
    return (
      <Canvas>
        <div className={styles.missingBlock}>
          <p className={styles.missing}>No Live component at “{slug}”.</p>
          <RefreshCatalogButton className={styles.refresh} />
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
