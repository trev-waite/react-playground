import { WordClock } from "./WordClock";
import type { CardMeta } from "@/lib/types";

export const meta: CardMeta = {
  title: "Word Clock",
  description: "The time written out as a sentence, the way you would say it. When the minute turns, only the words that change blur away and rise in, while the rest glide to their new places, and a blue hairline fills across each minute. Hold the arrows to wind the clock.",
  surface: {
    light: { swatch: "paper", content: ["#000000", "#6b6b6b"] },
    dark: { swatch: "night", content: ["#ffffff", "#9a9a9a"] },
  },
  reset: "replay",
};

export default function WordClockPreview() {
  return <WordClock />;
}
