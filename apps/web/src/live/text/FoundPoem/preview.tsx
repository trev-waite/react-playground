import { FoundPoem } from "./FoundPoem";
import type { CardMeta } from "@/lib/types";

export const meta: CardMeta = {
  title: "Found Poem",
  description: "Gandalf’s words to Frodo about the time that is given us, ready to make an erasure poem from. Tap the words to keep and they turn blue; erase the rest and every other word blurs away while the kept ones glide together into the poem. Bring the words back to try another.",
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
