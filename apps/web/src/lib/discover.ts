import { cardOrder } from "../live/order";
import { catalogEntriesFromLoaders, familiesFromModules } from "./catalog";
import type { CardMeta, FamilyMeta, LiveCatalog, PreviewModule } from "./types";

const previewLoaders = import.meta.glob<PreviewModule>("../live/**/preview.tsx");
// Served by previewMetaPlugin: only each preview's literal `meta`, never its component.
const previewMetas = import.meta.glob<CardMeta | undefined>("../live/**/preview.tsx", {
  query: "?meta",
  import: "meta",
  eager: true,
});
const familyModules = import.meta.glob<FamilyMeta>("../live/*/family.ts", {
  eager: true,
  import: "meta",
});

export const liveCatalog: LiveCatalog = {
  entries: catalogEntriesFromLoaders(previewLoaders, previewMetas),
  families: familiesFromModules(familyModules),
  order: cardOrder,
};
