import type { ComponentType } from "react";

export type PlaygroundStatus = "live" | "experimental";

export type PlaygroundMeta = {
  title?: string;
  status?: PlaygroundStatus;
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
  /** Catalog lifecycle: WIP vs published */
  status: PlaygroundStatus;
  /** Lazy loader for the Live / portable preview module */
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
