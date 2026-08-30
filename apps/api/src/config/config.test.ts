import { describe, expect, test } from "bun:test";
import path from "node:path";
import { parsePort, resolveApiConfig } from "./config";

describe("parsePort", () => {
  test("uses the fallback for missing or invalid values", () => {
    expect(parsePort(undefined, 3001)).toBe(3001);
    expect(parsePort("", 3001)).toBe(3001);
    expect(parsePort("abc", 3001)).toBe(3001);
    expect(parsePort("0", 3001)).toBe(3001);
    expect(parsePort("70000", 3001)).toBe(3001);
  });

  test("accepts a valid port", () => {
    expect(parsePort("4000", 3001)).toBe(4000);
  });
});

describe("resolveApiConfig", () => {
  test("defaults experimental and live roots under the web app", () => {
    const config = resolveApiConfig({}, "/tmp/api/src");
    expect(config.port).toBe(3001);
    expect(config.corsOrigin).toBe("http://localhost:3000");
    expect(config.webRoot).toBe(path.resolve("/tmp/web"));
    expect(config.experimentalRoot).toBe(
      path.resolve("/tmp/web/src/experimental"),
    );
    expect(config.liveRoot).toBe(path.resolve("/tmp/web/src/live"));
  });

  test("honors explicit roots and CORS", () => {
    const config = resolveApiConfig(
      {
        PORT: "3010",
        CORS_ORIGIN: "http://127.0.0.1:3000",
        WEB_ROOT: "/repo/apps/web",
        EXPERIMENTAL_ROOT: "/custom/experimental",
        LIVE_ROOT: "/custom/live",
      },
      "/unused",
    );
    expect(config.port).toBe(3010);
    expect(config.corsOrigin).toBe("http://127.0.0.1:3000");
    expect(config.webRoot).toBe(path.resolve("/repo/apps/web"));
    expect(config.experimentalRoot).toBe(path.resolve("/custom/experimental"));
    expect(config.liveRoot).toBe(path.resolve("/custom/live"));
  });
});
