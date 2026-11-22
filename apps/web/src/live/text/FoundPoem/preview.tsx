import { FoundPoem } from "./FoundPoem";
import type { CardMeta } from "@/lib/types";

export const meta: CardMeta = {
  title: "Found Poem",
  description: "A short meditation on today, ready to become an erasure poem. Tap the words to keep, erase the rest, and the kept words glide together into the poem.",
  size: "wide",
  surface: {
    light: { swatch: "paper", content: ["#000000", "#2563eb"] },
    dark: { swatch: "night", content: ["#ffffff", "#60a5fa"] },
  },
  reset: "replay",
};

export default function FoundPoemPreview() {
  return <FoundPoem />;
}
