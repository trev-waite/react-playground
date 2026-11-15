import { GooeyText } from "./GooeyText";
import type { CardMeta } from "@/lib/types";

export const meta: CardMeta = {
  title: "Gooey Text",
  description: "A drop of blue ink types each word. Each letter is pulled out of it on a bridge of slime that beads and pinches off, and the blue drains away, leaving the letter black. The drop swings straight back to land as the word's period, then swallows it and flows on.",
  size: "wide",
  surface: {
    light: { swatch: "paper", content: ["#08090c"] },
    dark: { swatch: "paper", content: ["#08090c"] },
  },
};

export default function GooeyTextPreview() {
  return <GooeyText />;
}
