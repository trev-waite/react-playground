import { useState } from "react";
import { PrimaryButton } from "./PrimaryButton";

export const meta = {
  title: "Primary Button",
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
