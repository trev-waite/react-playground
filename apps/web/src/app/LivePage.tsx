import { useMemo } from "react";
import { buildTree } from "../lib/catalog";
import { useLiveEntries } from "../lib/liveCatalog";
import { LiveStage } from "./LiveStage";
import { Sidebar } from "./Sidebar/Sidebar";
import styles from "./LivePage.module.css";

type LivePageProps = {
  slug: string | null;
  active?: boolean;
};

export function LivePage({ slug, active = true }: LivePageProps) {
  const liveEntries = useLiveEntries();
  const tree = useMemo(() => buildTree(liveEntries), [liveEntries]);

  return (
    <div className={styles.page}>
      <Sidebar tree={tree} active={active} />
      <div className={styles.main}>
        <LiveStage slug={slug} />
      </div>
    </div>
  );
}
