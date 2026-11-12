import { SegmentedControl } from "./SegmentedControl";
import type { FamilyMemberMeta } from "@/lib/types";

export const meta: FamilyMemberMeta = {
  title: "Segmented Control",
};

export default function SegmentedControlPreview() {
  return <SegmentedControl label="Range" options={["Day", "Week", "Month"]} />;
}
