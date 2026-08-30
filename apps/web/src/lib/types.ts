import type { ComponentType } from "react";

export type PlaygroundMeta = {
  title?: string;
};

export type PreviewModule = {
  default: ComponentType;
  meta?: PlaygroundMeta;
};

export type PlaygroundEntry = {
  slug: string;
  title: string;
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
