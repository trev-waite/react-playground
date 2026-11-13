import { MoonPhase } from "./MoonPhase";
import type { CardMeta } from "@/lib/types";

export const meta: CardMeta = {
  title: "Moon Phase",
  description: "Tonight's real moon, worked out from the date and drawn in one-bit dither. Drag sideways to turn through the month; let go and it drifts back to tonight.",
  surface: {
    light: { swatch: "night", content: ["#ffffff"] },
    dark: { swatch: "night", content: ["#ffffff"] },
  },
};

export default function MoonPhasePreview() {
  return <MoonPhase />;
}
