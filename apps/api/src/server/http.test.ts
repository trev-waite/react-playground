import { describe, expect, test } from "bun:test";
import { createHttp, isAllowedOrigin, strField } from "./http";

describe("isAllowedOrigin", () => {
  test("allows the configured origin", () => {
    expect(
      isAllowedOrigin("http://localhost:3000", "http://localhost:3000"),
    ).toBe(true);
  });

  test("treats localhost and 127.0.0.1 as the same loopback host", () => {
    expect(
      isAllowedOrigin("http://127.0.0.1:3000", "http://localhost:3000"),
    ).toBe(true);
    expect(
      isAllowedOrigin("http://localhost:3000", "http://127.0.0.1:3000"),
    ).toBe(true);
  });

  test("rejects a different port or host", () => {
    expect(
      isAllowedOrigin("http://localhost:3001", "http://localhost:3000"),
    ).toBe(false);
    expect(
      isAllowedOrigin("http://example.com:3000", "http://localhost:3000"),
    ).toBe(false);
  });
});

describe("createHttp", () => {
  test("echoes a loopback alias origin on CORS headers", () => {
    const { corsHeaders, handleOptions } = createHttp("http://localhost:3000");
    const req = new Request("http://api.test/api/ideas", {
      method: "OPTIONS",
      headers: { Origin: "http://127.0.0.1:3000" },
    });
    expect(corsHeaders(req)["Access-Control-Allow-Origin"]).toBe(
      "http://127.0.0.1:3000",
    );
    expect(handleOptions(req).status).toBe(204);
  });

  test("rejects invalid JSON bodies", async () => {
    const { readJsonBody } = createHttp("http://localhost:3000");
    const parsed = await readJsonBody(
      new Request("http://api.test/api/ideas", {
        method: "POST",
        body: "{",
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.response.status).toBe(400);
  });

  test("strField reads strings and defaults the rest", () => {
    expect(strField({ name: "Blob" }, "name")).toBe("Blob");
    expect(strField({ name: 1 }, "name")).toBe("");
    expect(strField({}, "name")).toBe("");
  });
});
