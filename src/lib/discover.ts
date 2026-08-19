import type { PlaygroundEntry, PlaygroundStatus, TreeFolder, TreeLeaf, TreeNode } from "./types";
import { previewModules, previewStatuses } from "./playground.gen";

function titleFromSlug(slug: string): string {
  const leaf = slug.split("/").pop() ?? slug;
  return leaf.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function buildEntries(): PlaygroundEntry[] {
  return Object.entries(previewModules)
    .map(([slug, load]) => ({
      slug,
      title: titleFromSlug(slug),
      status: (previewStatuses[slug] ?? "live") as PlaygroundStatus,
      load,
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

export const playgroundEntries: PlaygroundEntry[] = buildEntries();

export const entriesBySlug: Map<string, PlaygroundEntry> = new Map(
  playgroundEntries.map(e => [e.slug, e]),
);

export const liveEntries: PlaygroundEntry[] = playgroundEntries.filter(
  e => e.status === "live",
);

type MutableFolder = {
  name: string;
  folders: Map<string, MutableFolder>;
  leaves: TreeLeaf[];
};

function ensureFolder(parent: MutableFolder, name: string): MutableFolder {
  let folder = parent.folders.get(name);
  if (!folder) {
    folder = { name, folders: new Map(), leaves: [] };
    parent.folders.set(name, folder);
  }
  return folder;
}

/**
 * Build a nested folder tree from flat slug paths.
 */
export function buildTree(entries: PlaygroundEntry[] = playgroundEntries): TreeNode[] {
  const root: MutableFolder = { name: "", folders: new Map(), leaves: [] };

  for (const entry of entries) {
    const parts = entry.slug.split("/");
    let current = root;

    for (let i = 0; i < parts.length - 1; i++) {
      current = ensureFolder(current, parts[i]!);
    }

    const leafName = parts[parts.length - 1]!;
    current.leaves.push({
      type: "leaf",
      name: leafName,
      title: entry.title,
      slug: entry.slug,
    });
  }

  function finalize(folder: MutableFolder): TreeNode[] {
    const nodes: TreeNode[] = [];

    const folderNames = [...folder.folders.keys()].sort((a, b) => a.localeCompare(b));
    for (const name of folderNames) {
      const child = folder.folders.get(name)!;
      const folderNode: TreeFolder = {
        type: "folder",
        name: child.name,
        children: finalize(child),
      };
      nodes.push(folderNode);
    }

    const leaves = [...folder.leaves].sort((a, b) => a.name.localeCompare(b.name));
    nodes.push(...leaves);

    return nodes;
  }

  return finalize(root);
}
