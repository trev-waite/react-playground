import { RakingLight } from "./RakingLight";
import type { CardMeta } from "@/lib/types";

export const meta: CardMeta = {
  title: "Raking Light",
  description: "A word pressed into paper with no ink, lit on the GPU by a low lamp that follows your pointer, so each letter's walls catch the light and cast shadows.",
  surface: {
    light: { swatch: "paper", content: ["#000000"] },
    dark: { swatch: "night", content: ["#ffffff"] },
  },
  reset: "replay",
};

export default function RakingLightPreview() {
  return <RakingLight />;
}
