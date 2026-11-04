import { describe, expect, test } from "bun:test";
import { resolveSiteUrl } from "./siteUrlPlugin.ts";

describe("resolveSiteUrl", () => {
  test("prefers SITE_URL and drops a trailing slash", () => {
    expect(resolveSiteUrl({ SITE_URL: "https://play.example.com/", VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app" })).toBe(
      "https://play.example.com",
    );
  });

  test("falls back to the Vercel production domain", () => {
    expect(resolveSiteUrl({ VERCEL_PROJECT_PRODUCTION_URL: "play.vercel.app" })).toBe("https://play.vercel.app");
  });

  test("is null when no origin is known", () => {
    expect(resolveSiteUrl({})).toBeNull();
  });
});
