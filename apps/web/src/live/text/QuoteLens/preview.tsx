import { QuoteLens } from "./QuoteLens";
import type { CardMeta } from "@/lib/types";

export const meta: CardMeta = {
  title: "Quote Lens",
  description: "A Dan Campbell quote with a magnifying glass drifting over it. Point to steer it, click or tap to look closer, or drag it with a finger; left alone, it drifts again.",
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
