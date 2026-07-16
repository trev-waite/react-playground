import type { ComponentType } from "react";

export type PlaygroundMeta = {
  title?: string;
};

export type PreviewModule = {
  default: ComponentType;
  meta?: PlaygroundMeta;
};

export type PlaygroundEntry = {
  /** URL/path slug, e.g. "buttons/PrimaryButton" */
  slug: string;
  /** Display title */
  title: string;
  /** Lazy loader for the preview module */
  load: () => Promise<PreviewModule>;
};

export type TreeFolder = {
  type: "folder";
  name: string;
  children: TreeNode[];
};

export type TreeLeaf = {
  type: "leaf";
  name: string;
  title: string;
  slug: string;
};

export type TreeNode = TreeFolder | TreeLeaf;
