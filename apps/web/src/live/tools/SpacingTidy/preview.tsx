import { SpacingTidy } from "./SpacingTidy";
import type { CardMeta } from "@/lib/types";

export const meta: CardMeta = {
  title: "Spacing Tidy",
  description: "A drop-in layout sheet: drag anything, then snap every gap onto the spacing scale.",
  size: "wide",
  background: "#e9edf3",
  reset: "reset",
};

export default function SpacingTidyPreview() {
  return <SpacingTidy />;
}
