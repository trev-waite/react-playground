import { GooeyText } from "./GooeyText";
import type { CardMeta } from "@/lib/types";

export const meta: CardMeta = {
  title: "Gooey Text",
  description: "A drop of blue ink types each word. Letters ooze out of it like slime, the strand thinning until it snaps and the letter sets black. The drop lands as the word's period, then swallows it and flows on.",
  size: "wide",
  surface: {
    light: { swatch: "paper", content: ["#08090c"] },
    dark: { swatch: "paper", content: ["#08090c"] },
  },
};

export default function GooeyTextPreview() {
  return <GooeyText />;
}
