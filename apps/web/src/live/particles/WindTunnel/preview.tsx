import { WindTunnel } from "./WindTunnel";
import styles from "./WindTunnelPreview.module.css";
import type { CardMeta } from "@/lib/types";

export const meta: CardMeta = {
  title: "Wind Tunnel",
  description: "Smoke lines stream past a word the way they do in a wind tunnel, bending around every letter and tumbling in its wake. Put your pointer in the flow to part it.",
  size: "wide",
  surface: {
    light: { swatch: "blue", content: ["#ffffff"] },
    dark: { swatch: "blue", content: ["#ffffff"] },
  },
};

export default function WindTunnelPreview() {
  return (
    <div className={styles.stage}>
      <WindTunnel />
    </div>
  );
}
