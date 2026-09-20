import { RefreshCatalogButton } from "../RefreshCatalogButton";
import type { TreeNode } from "../../lib/types";
import { EdgePanel, LIVE_SIDEBAR_WIDTH, useEdgePanel } from "../EdgePanel";
import { useView } from "../view/ViewController";
import { Tree } from "./Tree";
import styles from "./Sidebar.module.css";

type SidebarProps = {
  tree: TreeNode[];
};

export function Sidebar({ tree }: SidebarProps) {
  const { mode } = useView();

  return (
    <EdgePanel
      side="left"
      label="Component browser"
      width={LIVE_SIDEBAR_WIDTH}
      enabled={mode === "live"}
    >
      <SidebarBody tree={tree} />
    </EdgePanel>
  );
}

function SidebarBody({ tree }: { tree: TreeNode[] }) {
  const { close } = useEdgePanel();

  return (
    <>
      <header className={styles.header}>
        <p className={styles.brand}>Playground</p>
        <RefreshCatalogButton className={styles.refresh} />
      </header>
      <nav className={styles.nav} aria-label="Live components">
        {tree.length === 0 ? (
          <p className={styles.empty}>No live components yet.</p>
        ) : (
          <Tree nodes={tree} onNavigate={close} />
        )}
      </nav>
    </>
  );
}
