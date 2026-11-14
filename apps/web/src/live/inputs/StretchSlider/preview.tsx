import { StretchSlider } from "./StretchSlider";
import styles from "./StretchSliderPreview.module.css";
import type { CardMeta } from "@/lib/types";

export const meta: CardMeta = {
  title: "Stretch Slider",
  description: "A pill slider that stretches like rubber when you drag it fast, and turns green with a springy pop when you fill it to 100.",
  surface: {
    light: { swatch: "paper", content: ["#0b0b0c"] },
    dark: { swatch: "orange", content: ["#0b0b0c"] },
  },
  reset: "reset",
};

export default function StretchSliderPreview() {
  return (
    <div className={styles.stage}>
      <StretchSlider label="Progress" defaultValue={40} />
    </div>
  );
}
