import { SegmentedControl } from "./SegmentedControl";

export const meta = {
  title: "Segmented Control",
};

export default function SegmentedControlPreview() {
  return <SegmentedControl label="Range" options={["Day", "Week", "Month"]} />;
}
