import { lazy, Suspense, useMemo } from "react";
import { liveEntries } from "../lib/discover";
import { Canvas } from "./Canvas";
import styles from "./LiveStage.module.css";

export function EmptyStage() {
  return <Canvas empty />;
}

type LiveStageProps = {
  slug?: string | null;
};

export function LiveStage({ slug: slugProp }: LiveStageProps) {
  const slug = slugProp ?? null;
  const Preview = useMemo(() => {
    if (!slug) return undefined;
    const entry = liveEntries.find(candidate => candidate.slug === slug);
    if (!entry) return undefined;
    return lazy(() =>
      entry.load().then(module => ({
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
        <p className={styles.missing}>No Live component at “{slug}”.</p>
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
