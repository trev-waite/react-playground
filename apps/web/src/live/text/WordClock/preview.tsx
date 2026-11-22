import { WordClock } from "./WordClock";
import type { CardMeta } from "@/lib/types";

export const meta: CardMeta = {
  title: "Word Clock",
  description: "The time written as a sentence. When the minute turns, only the words that change are swapped while the rest glide into place. Hold the arrows to wind it.",
  surface: {
    light: { swatch: "paper", content: ["#000000", "#6b6b6b"] },
    dark: { swatch: "night", content: ["#ffffff", "#9a9a9a"] },
  },
  reset: "replay",
};

export default function WordClockPreview() {
  return <WordClock />;
}
