import { describe, expect, test } from "bun:test";
import path from "node:path";
import ts from "typescript";
import { readLiveCards } from "./liveCards.ts";
import { oneFileSources } from "./oneFile.ts";

const web = path.join(import.meta.dir, "..");
const live = path.join(web, "src/live");

describe("oneFileSources", () => {
  test("inlines helpers, styles, and other Live components, renaming a clashing class map", async () => {
    const [file, ...rest] = await oneFileSources(path.join(live, "buttons/ProfileButton"), live);
    expect(rest).toEqual([]);
    expect(file!.name).toBe("ProfileButton.tsx");
    const imports = file!.code.split("\n").filter(line => line.startsWith("import "));
    expect(imports).toEqual([expect.stringMatching(/ from "react";$/), 'import { flushSync } from "react-dom";']);
    expect(file!.code).toContain("function SegmentedControl(");
    expect(file!.code).toContain("function geometry(");
    expect(file!.code).toContain("const switchStyles = {");
    expect(file!.code).toContain("className={styles.stage}");
    expect(file!.code).toContain('  stage: "profile-button-stage",');
    expect(file!.code).toContain(".profile-button-stage[data-open] .profile-button-portal");
    expect(file!.code).toContain("export function ProfileButton(");
    expect(file!.code).not.toContain("export function geometry(");
  });

  test("scopes keyframes with the classes", async () => {
    const [file] = await oneFileSources(path.join(live, "loaders/RelayDots"), live);
    const named = [...file!.code.matchAll(/@keyframes ([\w-]+)/g)].map(match => match[1]!);
    expect(named.length).toBeGreaterThan(0);
    for (const name of named) expect(name).toStartWith("relay-dots-");
  });

  test("keeps a Web Worker as a file of its own, which the component still starts by URL", async () => {
    const files = await oneFileSources(path.join(live, "backgrounds/Topography"), live);
    expect(files.map(file => file.name)).toEqual(["Topography.tsx", "stillWorker.ts"]);
    expect(files[0]!.code).toContain('new URL("./stillWorker.ts", import.meta.url)');
    expect(files[1]!.code).toContain("function drawStill(");
    expect(files[1]!.code).not.toMatch(/^import .* from "\.\//m);
  });

  test("gives nothing for a folder without a component named after it", async () => {
    expect(await oneFileSources(path.join(live, "controls"), live)).toEqual([]);
  });

  test("every Live component's one file type-checks under the project's own settings", async () => {
    const config = ts.getParsedCommandLineOfConfigFile(path.join(web, "tsconfig.json"), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} })!;
    const virtual = new Map<string, string>();
    for (const card of await readLiveCards(live)) {
      for (const member of card.members) {
        for (const file of await oneFileSources(path.join(live, member.slug), live)) {
          virtual.set(path.join(web, "src/.onefile", member.slug, file.name), file.code);
        }
      }
    }
    const host = ts.createCompilerHost(config.options);
    const readFile = host.readFile;
    host.readFile = file => virtual.get(file) ?? readFile(file);
    host.fileExists = file => virtual.has(file) || ts.sys.fileExists(file);
    const program = ts.createProgram({ rootNames: [...virtual.keys(), path.join(web, "src/vite-env.d.ts")], options: config.options, host });
    const problems = ts
      .getPreEmitDiagnostics(program)
      .map(diagnostic => `${diagnostic.file ? path.relative(web, diagnostic.file.fileName) : ""}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`);
    expect(problems).toEqual([]);
    expect(virtual.size).toBeGreaterThan(20);
  }, 60_000);
});
