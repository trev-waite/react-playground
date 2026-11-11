import type { ComponentType } from "react";

/** How many grid cells a card covers: 1×1, 2×1, 1×2, or 2×2. */
export type CardSize = "small" | "wide" | "tall" | "large";

/** Which ink reads on the card background. */
export type CardTheme = "light" | "dark";

/**
 * Presentation for a Live card. Everything is optional: a card is a plain
 * white 1×1 tile until it says otherwise.
 */
export type CardMeta = {
  title?: string;
  /** Short line in the card footer. */
  description?: string;
  size?: CardSize;
  /** Any CSS background. The card is otherwise unopinionated. */
  background?: string;
  theme?: CardTheme;
  /** Footer button that remounts the card: "reset" for state, "replay" for intros. */
  reset?: "reset" | "replay";
};

export type PreviewModule = {
  default: ComponentType;
  meta?: CardMeta;
};

export type PlaygroundEntry = {
  slug: string;
  title: string;
  /** Read at build time, so cards show before their component loads. */
  meta?: CardMeta;
  load: () => Promise<PreviewModule>;
};

/** `live/<folder>/family.ts` groups every component in that folder into one card. */
export type FamilyMeta = CardMeta & { title: string };

export type LiveCatalog = {
  entries: PlaygroundEntry[];
  /** Keyed by Live folder name. */
  families: Record<string, FamilyMeta>;
  /** Card slugs in display order; unlisted cards follow alphabetically. */
  order: readonly string[];
};
