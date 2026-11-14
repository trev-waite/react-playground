import { Topography } from "./Topography";
import type { CardMeta } from "@/lib/types";

export const meta: CardMeta = {
  title: "Topography",
  description: "A terraced relief map for behind a page: contour layers stacked like cut paper, drifting slowly, each casting a soft shadow. Move your pointer and the ground rises into a hill.",
  size: "large",
  surface: {
    light: { swatch: "paper", content: ["#1c2430"] },
    dark: { swatch: "paper", content: ["#1c2430"] },
  },
};

export default function TopographyPreview() {
  return <Topography />;
}
