import { Letterpress } from "./Letterpress";
import type { CardMeta } from "@/lib/types";

export const meta: CardMeta = {
  title: "Letterpress",
  description: "Type in motion.",
  size: "wide",
  surface: {
    light: { swatch: "paper", content: ["#111111", "#8b8b8b"] },
    dark: { swatch: "night", content: ["#f2f2f2", "#767676"] },
  },
};

export default function LetterpressPreview() {
  return <Letterpress />;
}
