import { FocusPull } from "./FocusPull";
import type { CardMeta } from "@/lib/types";

export const meta: CardMeta = {
  title: "Focus Pull",
  description: "Gandalf’s words to Frodo on a page tilted away from you, shot with a shallow depth of field on the GPU. Point at a line, tap it, or use the arrow keys, and the focus racks to it.",
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
