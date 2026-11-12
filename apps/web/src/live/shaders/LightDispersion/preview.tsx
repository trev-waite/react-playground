import { LightDispersion } from "./LightDispersion";
import type { CardMeta } from "@/lib/types";

export const meta: CardMeta = {
  title: "Light Dispersion",
  description: "White light runs through the letters and splits into a spectrum. Move your pointer across it to push the glow around.",
  size: "wide",
  surface: {
    light: { swatch: "night", content: ["#ffffff"] },
    dark: { swatch: "night", content: ["#ffffff"] },
  },
};

export default function LightDispersionPreview() {
  return <LightDispersion />;
}
