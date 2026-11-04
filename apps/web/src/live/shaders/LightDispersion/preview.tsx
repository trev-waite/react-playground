import { LightDispersion } from "./LightDispersion";
import type { CardMeta } from "@/lib/types";

export const meta: CardMeta = {
  title: "Light Dispersion",
  size: "wide",
  background: "#000000",
  theme: "dark",
};

export default function LightDispersionPreview() {
  return <LightDispersion />;
}
