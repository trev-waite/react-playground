import { FoundPoem } from "./FoundPoem";
import type { CardMeta } from "@/lib/types";

export const meta: CardMeta = {
  title: "Found Poem",
  description: "A meditation on today as the first day of the rest of your life, traded away for whatever you make of it, ready to make an erasure poem from. Tap the words to keep and they turn blue; erase the rest and every other word blurs away while the kept ones glide together into the poem. Bring the words back to try another.",
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
