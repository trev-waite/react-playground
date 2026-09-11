import { describe, expect, test } from "bun:test";
import { Glob } from "bun";
import path from "node:path";

const ideasRoot = path.join(import.meta.dir, "ideas");
const IDEA_NAME_RE = /^[A-Za-z][A-Za-z0-9]*$/;

describe("idea sources", () => {
  test("keeps idea source files on disk for the Vite glob", async () => {
    const names: string[] = [];
    for await (const file of new Glob("*/source.tsx").scan({
      cwd: ideasRoot,
      onlyFiles: true,
    })) {
      const name = file.replace(/\/source\.tsx$/, "").replace(/\\/g, "/");
      if (!name.includes("/") && IDEA_NAME_RE.test(name)) names.push(name);
    }
    expect(names).toContain("BirdTwo");
    expect(names).toContain("LightDispersion");
  });
});
