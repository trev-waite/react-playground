import { RefreshCatalogButton } from "../RefreshCatalogButton";
import type { TreeNode } from "../../lib/types";
import { EdgePanel, LIVE_SIDEBAR_WIDTH, useEdgePanel } from "../EdgePanel";
import { Tree } from "./Tree";
import styles from "./Sidebar.module.css";

type SidebarProps = {
  tree: TreeNode[];
  active: boolean;
};

export function Sidebar({ tree, active }: SidebarProps) {
  return (
    <EdgePanel
      side="left"
      label="Component browser"
      width={LIVE_SIDEBAR_WIDTH}
      enabled={active}
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
        {import.meta.env.DEV && <RefreshCatalogButton className={styles.refresh} />}
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
