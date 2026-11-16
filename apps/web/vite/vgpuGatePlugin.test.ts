import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { importsGatedVgpu, VGPU_GATE, VGPU_LIBRARY } from "./vgpuGatePlugin.ts";

const root = path.resolve(import.meta.dirname, "..");

function exportedNames(code: string): string[] {
  const list = /export\s*\{([^}]*)\}/.exec(code)?.[1];
  const names = list ? list.split(",") : Array.from(code.matchAll(/export const (\w+)/g), match => match[1]!);
  return names.map(name => name.trim()).filter(Boolean).sort();
}

/**
 * The names a module takes from vgpu at run time. An import of the whole
 * package (`import * as vgpu`, a default import) comes back as `*`, which the
 * gate never offers: it names what it loads.
 */
function importedFromVgpu(code: string): string[] {
  return Array.from(code.matchAll(/import\s+(type\s+)?([^;]*?)\s+from\s*["']vgpu["']/g)).flatMap(([, typeOnly, clause]) => {
    if (typeOnly) return [];
    const named = /\{([^}]*)\}/.exec(clause!);
    const names = (named?.[1] ?? "")
      .split(",")
      .map(item => item.trim())
      .filter(item => item !== "" && !item.startsWith("type "))
      .map(item => item.split(/\s+as\s+/)[0]!);
    const rest = clause!.replace(/\{[^}]*\}/, "").replace(/,/g, "").trim();
    return rest === "" ? names : ["*", ...names];
  });
}

describe("importsGatedVgpu", () => {
  test("sends every import of the package to the gate, except the library module's own", () => {
    expect(importsGatedVgpu("vgpu", path.join(root, "src/live/shaders/LightDispersion/LightDispersion.tsx"), root)).toBe(true);
    expect(importsGatedVgpu("vgpu", path.join(root, "src/gpu/useGpu.ts"), root)).toBe(true);
    expect(importsGatedVgpu("vgpu", path.join(root, VGPU_LIBRARY), root)).toBe(false);
  });

  test("leaves other packages and vgpu's other entry points alone", () => {
    expect(importsGatedVgpu("vgpu/node", path.join(root, "scripts/check.ts"), root)).toBe(false);
    expect(importsGatedVgpu("react", path.join(root, "src/main.tsx"), root)).toBe(false);
  });
});

describe("the vgpu gate", () => {
  test("stands in for everything the library module loads", async () => {
    const gate = await readFile(path.join(root, VGPU_GATE), "utf8");
    const library = await readFile(path.join(root, VGPU_LIBRARY), "utf8");
    expect(exportedNames(gate)).toEqual(exportedNames(library));
  });

  test("offers every vgpu function the app imports, so a new one is added to the gate before it fails a build", async () => {
    const gated = exportedNames(await readFile(path.join(root, VGPU_GATE), "utf8"));
    // Every module but the two that are the gate: the library names what it loads, and the gate imports nothing from vgpu.
    const gate = [VGPU_LIBRARY, VGPU_GATE].map(file => path.relative("src", file));
    const files = (await readdir(path.join(root, "src"), { recursive: true })).filter(
      file => /\.tsx?$/.test(file) && !gate.includes(file),
    );
    const missing: string[] = [];
    for (const file of files) {
      for (const name of importedFromVgpu(await readFile(path.join(root, "src", file), "utf8"))) {
        if (!gated.includes(name)) missing.push(`${file}: ${name}`);
      }
    }
    expect(missing).toEqual([]);
  });

  test("reads an import by the name vgpu exports it under, in either quote and over several lines, and skips types", () => {
    const code = [
      'import { effect as paint, type Frame, clock } from "vgpu";',
      "import {\n  sampler,\n  target,\n} from 'vgpu';",
      'import type { Gpu } from "vgpu";',
      'import { useRef } from "react";',
    ].join("\n");
    expect(importedFromVgpu(code)).toEqual(["effect", "clock", "sampler", "target"]);
  });

  test("reports an import of the whole package, which the gate cannot stand in for", () => {
    expect(importedFromVgpu('import * as vgpu from "vgpu";')).toEqual(["*"]);
    expect(importedFromVgpu('import vgpu, { effect } from "vgpu";')).toEqual(["*", "effect"]);
  });
});
