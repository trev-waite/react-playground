import { lazy, Suspense, useMemo } from "react";
import { playgroundEntries } from "../lib/discover";
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

type ExperimentStageProps = {
  /** When set, render this slug instead of reading the URL. */
  slug?: string | null;
};

export function ExperimentStage({ slug: slugProp }: ExperimentStageProps) {
  const slug = slugProp ?? null;
  const entry = slug ? playgroundEntries.find(e => e.slug === slug) : undefined;
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
        <p className={styles.missing}>No experiment at “{slug}”.</p>
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
