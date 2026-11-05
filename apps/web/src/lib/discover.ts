import { cardOrder } from "../live/order";
import { catalogEntriesFromLoaders, familiesFromModules } from "./catalog";
import type { FamilyMeta, LiveCatalog, PreviewModule } from "./types";

const previewLoaders = import.meta.glob<PreviewModule>("../live/**/preview.tsx");
const familyModules = import.meta.glob<FamilyMeta>("../live/*/family.ts", {
  eager: true,
  import: "meta",
});

export const liveCatalog: LiveCatalog = {
  entries: catalogEntriesFromLoaders(previewLoaders),
  families: familiesFromModules(familyModules),
  order: cardOrder,
};
