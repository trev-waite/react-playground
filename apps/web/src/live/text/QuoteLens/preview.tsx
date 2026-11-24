import { QuoteLens } from "./QuoteLens";
import type { CardMeta } from "@/lib/types";

export const meta: CardMeta = {
  title: "Quote Lens",
  description: "A Dan Campbell quote with a magnifying glass drifting over it. Take it by its glass, rim, or handle and drag it with a mouse, pen, or finger; click or tap the glass to look closer, or the page to bring it there. Left alone, it drifts again.",
  size: "wide",
  surface: {
    light: { swatch: "paper", content: ["#000000", "#6b6b6b"] },
    dark: { swatch: "night", content: ["#ffffff", "#9a9a9a"] },
  },
  reset: "replay",
};

export default function QuoteLensPreview() {
  return <QuoteLens />;
}
