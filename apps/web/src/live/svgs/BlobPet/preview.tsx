import { useState } from "react";
import { SegmentedControl } from "@/live/controls/SegmentedControl/SegmentedControl";
import { BlobPet } from "./BlobPet";
import styles from "./BlobPetPreview.module.css";
import type { CardMeta } from "@/lib/types";

const MODES = ["Morph", "Rest"] as const;

export const meta: CardMeta = {
  title: "Blob Pet",
  description: "A squishy blob that melts into faces, shapes, and even words. Tap it to skip ahead, or let it rest and watch you.",
  reset: "replay",
};

export default function BlobPetPreview() {
  const [mode, setMode] = useState<string>(MODES[0]);

  return (
    <div className={styles.stage}>
      <div className={styles.pet}>
        <BlobPet progress={mode === "Rest" ? 0 : 1} />
      </div>
      <SegmentedControl label="Blob Pet motion" options={MODES} defaultValue={MODES[0]} onChange={setMode} />
    </div>
  );
}
