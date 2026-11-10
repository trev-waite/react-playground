import { ParticleText } from "./ParticleText";
import styles from "./ParticleTextPreview.module.css";
import type { CardMeta } from "@/lib/types";

export const meta: CardMeta = {
  title: "Particle Text",
  description: "Sweep across the name to blow its ink away as drifting dots, or press to burst it; the letters swirl back together.",
  size: "wide",
  background: "#f2f2f2",
};

export default function ParticleTextPreview() {
  return (
    <h1 className={styles.name}>
      <ParticleText>Trevor Waite</ParticleText>
    </h1>
  );
}
