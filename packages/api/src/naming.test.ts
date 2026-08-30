import { describe, expect, test } from "bun:test";
import {
  isSafeComponentName,
  normalizeFolder,
  toComponentName,
} from "./naming";

describe("normalizeFolder", () => {
  test("normalizes display names", () => {
    expect(normalizeFolder("Buttons")).toBe("buttons");
    expect(normalizeFolder(" my shapes ")).toBe("my-shapes");
    expect(normalizeFolder("")).toBeNull();
  });
});

describe("toComponentName", () => {
  test("builds PascalCase names", () => {
    expect(toComponentName("morph blob")).toBe("MorphBlob");
    expect(toComponentName("Untitled idea")).toBe("UntitledIdea");
    expect(toComponentName("123 bad")).toBeNull();
  });
});

describe("isSafeComponentName", () => {
  test("allows PascalCase names and rejects path traversal", () => {
    expect(isSafeComponentName("MorphBlob")).toBe(true);
    expect(isSafeComponentName("../shells")).toBe(false);
    expect(isSafeComponentName("experimental/Foo")).toBe(false);
    expect(isSafeComponentName("")).toBe(false);
  });
});
