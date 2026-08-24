import { useMemo } from "react";
import { buildTree } from "../lib/discover";
import { ExperimentStage } from "./ExperimentStage";
import { Sidebar } from "./Sidebar/Sidebar";
import { useView } from "./view/ViewController";
import styles from "./LivePage.module.css";

export function LivePage() {
  const { liveSlug, liveEntries } = useView();
  const tree = useMemo(() => buildTree(liveEntries), [liveEntries]);

  return (
    <div className={styles.page}>
      <Sidebar tree={tree} />
      <div className={styles.main}>
        <ExperimentStage slug={liveSlug} />
      </div>
    </div>
  );
}
