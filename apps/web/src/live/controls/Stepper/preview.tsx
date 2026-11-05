import { Stepper } from "./Stepper";

export const meta = {
  title: "Stepper",
};

export default function StepperPreview() {
  return <Stepper label="Gap" defaultValue={24} min={0} max={64} step={8} />;
}
