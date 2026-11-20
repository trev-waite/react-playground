import { GandalfHologram } from "./GandalfHologram";
import type { CardMeta } from "@/lib/types";

export const meta: CardMeta = {
  title: "Gandalf’s Hat",
  description: "A point-cloud hat. Drag to turn it or tap to drop the dots.",
  surface: {
    light: { swatch: "night", content: ["#f3f3f3"] },
    dark: { swatch: "night", content: ["#f3f3f3"] },
  },
};

export default function GandalfHologramPreview() {
  return <GandalfHologram />;
}
