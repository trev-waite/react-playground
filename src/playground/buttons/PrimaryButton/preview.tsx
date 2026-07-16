import { useState } from "react";
import { PrimaryButton } from "./PrimaryButton";

export const meta = {
  title: "Primary Button",
};

export default function PrimaryButtonPreview() {
  const [count, setCount] = useState(0);

  return (
    <PrimaryButton onClick={() => setCount(c => c + 1)}>
      Clicked {count}×
    </PrimaryButton>
  );
}
