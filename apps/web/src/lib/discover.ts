import { catalogEntriesFromLoaders } from "./catalog";
import type { PreviewModule } from "./types";

const previewLoaders = import.meta.glob<PreviewModule>("../live/**/preview.tsx");
export const liveEntries = catalogEntriesFromLoaders(previewLoaders);
