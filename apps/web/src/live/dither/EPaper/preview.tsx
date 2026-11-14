import { EPaper } from "./EPaper";
import type { CardMeta } from "@/lib/types";

export const meta: CardMeta = {
  title: "E-Paper",
  description: "An e-reader screen drawn in one-bit dither. Tap to turn the page: quick turns leave a ghost of the last one, and every third turn flashes the ghosts away.",
  size: "tall",
  surface: {
    light: { swatch: "orange", content: ["#17181b"] },
    dark: { swatch: "green", content: ["#17181b"] },
  },
};

export default function EPaperPreview() {
  return <EPaper />;
}
