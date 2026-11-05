import { LightDispersion } from "./LightDispersion";
import type { CardMeta } from "@/lib/types";

export const meta: CardMeta = {
  title: "Light Dispersion",
  description: "White light runs through the letters and splits into a spectrum. Move your pointer across it to push the glow around.",
  size: "wide",
  background: "#000000",
  theme: "dark",
};

export default function LightDispersionPreview() {
  return <LightDispersion />;
}
