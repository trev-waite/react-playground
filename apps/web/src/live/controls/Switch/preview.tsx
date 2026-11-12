import { Switch } from "./Switch";
import type { FamilyMemberMeta } from "@/lib/types";

export const meta: FamilyMemberMeta = {
  title: "Switch",
};

export default function SwitchPreview() {
  return <Switch label="Notifications" />;
}
