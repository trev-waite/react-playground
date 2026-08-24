import { describe, expect, test } from "bun:test";
import { statusFromPreviewSource } from "./sync-playground";

describe("statusFromPreviewSource", () => {
  test("defaults to live", () => {
    expect(statusFromPreviewSource("export const meta = {};")).toBe("live");
  });

  test("detects experimental", () => {
    expect(statusFromPreviewSource(`status: "experimental"`)).toBe(
      "experimental",
    );
  });
});
