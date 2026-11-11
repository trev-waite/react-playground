import type { ComponentType } from "react";
import type { CardSwatch, CardSwatchName } from "./cardSwatches";

/** How many grid cells a card covers: 1×1, 2×1, 1×2, or 2×2. */
export type CardSize = "small" | "wide" | "tall" | "large";

/** The site's light or dark theme. */
export type SiteTheme = "light" | "dark";

/** Which ink reads on the card background: dark ink on a light card, light ink on a dark one. */
export type CardTheme = "light" | "dark";

/** A plain color, so contrast against it can be checked. */
export type HexColor = `#${string}`;

/** How a card looks on one site theme: a swatch from `CARD_SWATCHES`, picked against the component it shows. */
export type CardSurface<T extends SiteTheme> = {
  swatch: CardSwatchName<T>;
  /** The component's main colors on this swatch, which the swatch must stand apart from. */
  content: readonly [HexColor, ...HexColor[]];
};

/**
 * A card's surface on the light site and on the dark site. Both are required:
 * only the card knows which swatch keeps its own component readable.
 * `src/live/surfaces.test.ts` holds every surface to the same contrast bar.
 */
export type CardSurfaces = { [T in SiteTheme]: CardSurface<T> };

/** A card's swatches, resolved to colors, for each site theme. */
export type CardColors = Record<SiteTheme, CardSwatch>;

/** Presentation for a Live card. Apart from its surfaces, a card is a 1×1 tile until it says otherwise. */
export type CardMeta = {
  title?: string;
  /** Short line in the card footer. */
  description?: string;
  size?: CardSize;
  surface: CardSurfaces;
  /** Footer button that remounts the card: "reset" for state, "replay" for intros. */
  reset?: "reset" | "replay";
};

/** A component on its folder's family card, which owns the presentation. */
export type FamilyMemberMeta = {
  title?: string;
};

export type PreviewMeta = CardMeta | FamilyMemberMeta;

export type PreviewModule = {
  default: ComponentType;
  meta?: PreviewMeta;
};

export type PlaygroundEntry = {
  slug: string;
  title: string;
  /** Read at build time, so cards show before their component loads. */
  meta?: PreviewMeta;
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
