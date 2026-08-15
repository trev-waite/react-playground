import { describe, expect, test } from "bun:test";
import { exportControlValues } from "./exportControlValues";

describe("exportControlValues", () => {
  test("serializes current control ids and values", () => {
    const source = exportControlValues([
      { id: "tracking", label: "Tracking", value: 40, onChange: () => undefined },
      { id: "weight", label: "Weight", value: 62, onChange: () => undefined },
    ]);

    expect(source).toBe(`export const values = {
  "tracking": 40,
  "weight": 62,
};
`);
  });
});
