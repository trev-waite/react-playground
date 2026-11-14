import { RelayDots } from "./RelayDots";
import styles from "./RelayDotsPreview.module.css";
import type { CardMeta } from "@/lib/types";

export const meta: CardMeta = {
  title: "Relay Dots",
  description: "A loading indicator where the lead dot hops over the line to the back while the rest shuffle forward, like a relay that never ends.",
  surface: {
    light: { swatch: "paper", content: ["#171c25"] },
    dark: { swatch: "green", content: ["#171c25"] },
  },
};

export default function RelayDotsPreview() {
  return (
    <div className={styles.stage}>
      <RelayDots />
    </div>
  );
}
