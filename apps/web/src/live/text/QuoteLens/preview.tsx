import { QuoteLens } from "./QuoteLens";
import type { CardMeta } from "@/lib/types";

export const meta: CardMeta = {
  title: "Quote Lens",
  description: "A Dan Campbell quote about not lying awake over the what-ifs rises word by word, then a magnifying glass drifts across it, enlarging the live text beneath. Point and it follows like a loupe, click or tap it to look closer, drag it with a finger or move it with the arrow keys; left alone, it drifts again.",
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
