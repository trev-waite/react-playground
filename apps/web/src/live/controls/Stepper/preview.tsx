import { Stepper } from "./Stepper";
import type { FamilyMemberMeta } from "@/lib/types";

export const meta: FamilyMemberMeta = {
  title: "Stepper",
};

export default function StepperPreview() {
  return <Stepper label="Gap" defaultValue={24} min={0} max={64} step={8} />;
}
