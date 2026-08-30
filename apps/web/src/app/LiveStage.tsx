import { lazy, Suspense, useMemo } from "react";
import { liveEntries } from "../lib/discover";
import { Canvas } from "./Canvas";
import styles from "./LiveStage.module.css";

const lazyPreviews = new Map(
  liveEntries.map(entry => [
    entry.slug,
    lazy(() =>
      entry.load().then(module => ({
        default: module.default,
      })),
    ),
  ]),
);

export function EmptyStage() {
  return <Canvas empty />;
}

type LiveStageProps = {
  slug?: string | null;
};

export function LiveStage({ slug: slugProp }: LiveStageProps) {
  const slug = slugProp ?? null;
  const entry = slug ? liveEntries.find(candidate => candidate.slug === slug) : undefined;
  const Preview = useMemo(
    () => (slug ? lazyPreviews.get(slug) : undefined),
    [slug],
  );

  if (!slug) {
    return <Canvas empty />;
  }

  if (!entry || !Preview) {
    return (
      <Canvas>
        <p className={styles.missing}>No Live component at “{slug}”.</p>
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
