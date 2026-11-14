import { ProfileButton } from "./ProfileButton";
import type { CardMeta } from "@/lib/types";

export const meta: CardMeta = {
  title: "Profile Button",
  description: "A blurry silhouette you can step into. Press it and you're pulled through the picture into a dark room where the profile and its settings wait; the arrow above the head zooms back out.",
  surface: {
    light: { swatch: "paper", content: ["#000000"] },
    dark: { swatch: "blue", content: ["#000000"] },
  },
};

const PROFILE = { name: "Sam Rivera", handle: "@blurryface" };

export default function ProfileButtonPreview() {
  return <ProfileButton profile={PROFILE} size={88} />;
}
