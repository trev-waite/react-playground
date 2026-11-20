import { FocusPull } from "./FocusPull";
import type { CardMeta } from "@/lib/types";

export const meta: CardMeta = {
  title: "Focus Pull",
  description: "Robert Frost’s “Nothing Gold Can Stay”, eight lines on how nothing bright lasts, set on a page tilted away from you and shot with a shallow depth of field on the GPU. The focus drifts slowly down the poem; point at a line, or touch it, and the focus racks to it while the lines around it soften, with a blue mark beside the line in focus.",
  size: "wide",
  surface: {
    light: { swatch: "paper", content: ["#000000", "#2563eb"] },
    dark: { swatch: "night", content: ["#ffffff", "#60a5fa"] },
  },
  reset: "replay",
};

export default function FocusPullPreview() {
  return <FocusPull />;
}
