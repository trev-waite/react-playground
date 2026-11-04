import { useState } from "react";
import { PrimaryButton } from "./PrimaryButton";
import type { CardMeta } from "@/lib/types";

export const meta: CardMeta = {
  title: "Primary Button",
  description: "Digits roll to the new count on every press.",
  reset: "reset",
};

export default function PrimaryButtonPreview() {
  const [count, setCount] = useState(0);

  return (
    <PrimaryButton
      count={count}
      suffix="×"
      onClick={() => setCount(current => current + 1)}
    >
      Clicked
    </PrimaryButton>
  );
}
