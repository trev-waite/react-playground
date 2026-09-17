import { useState } from "react";
import { NavLink } from "react-router";
import type { TreeNode } from "../../lib/types";
import styles from "./Sidebar.module.css";

type TreeProps = {
  nodes: TreeNode[];
  depth?: number;
  onNavigate?: () => void;
};

export function Tree({ nodes, depth = 0, onNavigate }: TreeProps) {
  return (
    <ul className={styles.tree} role={depth === 0 ? "tree" : "group"}>
      {nodes.map(node =>
        node.type === "folder" ? (
          <FolderNode
            key={`folder-${node.name}-${depth}`}
            node={node}
            depth={depth}
            onNavigate={onNavigate}
          />
        ) : (
          <li key={node.slug} role="treeitem">
            <NavLink
              to={`/${node.slug}`}
              className={({ isActive }) =>
                [styles.row, styles.leaf, isActive ? styles.active : ""]
                  .filter(Boolean)
                  .join(" ")
              }
              style={{ paddingLeft: `${8 + Math.max(0, depth - 1) * 16}px` }}
              onClick={onNavigate}
            >
              <span className={styles.label}>{node.title}</span>
            </NavLink>
          </li>
        ),
      )}
    </ul>
  );
}

function FolderNode({
  node,
  depth,
  onNavigate,
}: {
  node: Extract<TreeNode, { type: "folder" }>;
  depth: number;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <li role="treeitem" aria-expanded={open}>
      <button
        type="button"
        className={`${styles.row} ${styles.folder}`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        <span className={styles.chevron} data-open={open || undefined} aria-hidden="true">
          <ChevronIcon />
        </span>
        <FolderIcon className={styles.icon} />
        <span className={styles.label}>{node.name}</span>
      </button>
      {open ? <Tree nodes={node.children} depth={depth + 1} onNavigate={onNavigate} /> : null}
    </li>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
      <path
        d="M6 3.5 10.5 8 6 12.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2.5 4.75A1.75 1.75 0 0 1 4.25 3h2.1c.4 0 .78.17 1.04.46l.7.8c.14.15.33.24.53.24h3.13A1.75 1.75 0 0 1 13.5 6.25v5A1.75 1.75 0 0 1 11.75 13h-7.5A1.75 1.75 0 0 1 2.5 11.25v-6.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
