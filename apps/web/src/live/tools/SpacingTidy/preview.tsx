import { SpacingTidy } from "./SpacingTidy";
import type { CardMeta } from "@/lib/types";

export const meta: CardMeta = {
  title: "Spacing Tidy",
  description: "A drop-in layout sheet: drag anything, then snap every gap onto the spacing scale.",
  size: "wide",
  surface: {
    light: { swatch: "green", content: ["#ffffff", "#1c2430"] },
    dark: { swatch: "blue", content: ["#ffffff", "#1c2430"] },
  },
  reset: "reset",
};

export default function SpacingTidyPreview() {
  return <SpacingTidy />;
}
