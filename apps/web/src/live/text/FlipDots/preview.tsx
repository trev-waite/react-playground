import { FlipDots } from "./FlipDots";
import type { CardMeta } from "@/lib/types";

export const meta: CardMeta = {
  title: "Flip Dots",
  description: "A flip-disc sign like the ones on buses and station boards: every disc turns over to spell the next message, then the time. Sweep across it to flip them yourself.",
  size: "wide",
  surface: {
    light: { swatch: "paper", content: ["#14161a"] },
    dark: { swatch: "orange", content: ["#14161a"] },
  },
};

export default function FlipDotsPreview() {
  return <FlipDots />;
}
