import { RakingLight } from "./RakingLight";
import type { CardMeta } from "@/lib/types";

export const meta: CardMeta = {
  title: "Raking Light",
  description: "A word pressed into paper with no ink, the way a blind deboss looks, lit on the GPU by a low lamp. The lamp follows your pointer or finger, so light catches the near wall of every letter, shadow fills the far one, and the paper's fibers show where the light grazes them.",
  surface: {
    light: { swatch: "paper", content: ["#000000"] },
    dark: { swatch: "night", content: ["#ffffff"] },
  },
  reset: "replay",
};

export default function RakingLightPreview() {
  return <RakingLight />;
}
