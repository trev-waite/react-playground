import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import path from "node:path";
import { previewMeta } from "./previewMetaPlugin.ts";

const liveRoot = path.join(import.meta.dir, "../src/live");

describe("previewMeta", () => {
  test("reads a typed literal meta without running the module", () => {
    const code = `import { Dial } from "./Dial";
import type { CardMeta } from "@/lib/types";

export const meta: CardMeta = {
  title: "Dial",
  "size": \`wide\`,
  tags: ["a", -1],
  nested: { on: true } as const,
};

export default function DialPreview() {
  return <Dial />;
}
`;
    expect(previewMeta(code, "Dial/preview.tsx")).toEqual({
      title: "Dial",
      size: "wide",
      tags: ["a", -1],
      nested: { on: true },
    });
  });

  test("is undefined when a preview has no meta", () => {
    expect(previewMeta("export default function P() { return null; }", "P/preview.tsx")).toBeUndefined();
  });

  test("rejects meta that would need the module to run", () => {
    expect(() => previewMeta("const t = 'x';\nexport const meta = { title: t };", "A/preview.tsx")).toThrow(
      /plain literal/,
    );
    expect(() => previewMeta("export const meta = { ...base };", "B/preview.tsx")).toThrow(/plain literal/);
    expect(() => previewMeta("export const meta = { title: `${name}` };", "C/preview.tsx")).toThrow(/plain literal/);
  });

  test("every Live preview's meta reads statically, so its card can show before it loads", async () => {
    for await (const file of new Glob("**/preview.tsx").scan({ cwd: liveRoot })) {
      const meta = previewMeta(await Bun.file(path.join(liveRoot, file)).text(), file) as { title?: unknown } | undefined;
      expect(typeof meta?.title, file).toBe("string");
    }
  });
});
