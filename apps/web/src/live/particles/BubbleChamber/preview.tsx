import { BubbleChamber } from "./BubbleChamber";
import type { CardMeta } from "@/lib/types";

export const meta: CardMeta = {
  title: "Bubble Chamber",
  description: "Charged particles curl through a magnetic field and leave trails of bubbles, as in the old physics photographs. Click anywhere to fire a collision there.",
  surface: {
    light: { swatch: "paper", content: ["#1c2430"] },
    dark: { swatch: "night", content: ["#f5f7fa"] },
  },
};

export default function BubbleChamberPreview() {
  return <BubbleChamber />;
}
