import { describe, expect, test } from "bun:test";
import { immutableAssetRules } from "./assetHeadersPlugin";

describe("immutableAssetRules", () => {
  test("caches each hashed file by name, never all of /assets/*", () => {
    const rules = immutableAssetRules(["index.html", "assets/vendor-YahHAMAi.js", "assets/index-CdHbPVcA.js", "controls.html"]);
    expect(rules).toBe(
      "\n/assets/index-CdHbPVcA.js\n  Cache-Control: public, max-age=31536000, immutable\n" +
        "\n/assets/vendor-YahHAMAi.js\n  Cache-Control: public, max-age=31536000, immutable\n",
    );
    expect(rules).not.toContain("/assets/*");
  });
});
