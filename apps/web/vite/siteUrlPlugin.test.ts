import { describe, expect, test } from "bun:test";
import { resolveSiteUrl } from "./siteUrlPlugin.ts";

describe("resolveSiteUrl", () => {
  test("uses SITE_URL without a trailing slash", () => {
    expect(resolveSiteUrl({ SITE_URL: "https://play.example.com/" })).toBe("https://play.example.com");
  });

  test("is null when no origin is known", () => {
    expect(resolveSiteUrl({})).toBeNull();
  });
});
