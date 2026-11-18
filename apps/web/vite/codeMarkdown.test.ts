import { describe, expect, test } from "bun:test";
import { codeMarkdown, componentImports, type CodeCard } from "./codeMarkdown.ts";

const SITE = "https://studio.example.com";
const CONTROLS: CodeCard = {
  slug: "controls",
  title: "Controls",
  members: [
    { slug: "controls/Switch", title: "Switch", files: [{ name: "Switch.tsx", code: "export function Switch() {}\n" }] },
    { slug: "controls/Stepper", title: "Stepper", files: [{ name: "Stepper.tsx", code: "export function Stepper() {}\n" }] },
  ],
};
const PROFILE_CODE = [
  'import { useState } from "react";',
  'import { useGpu, type GpuSession as Session } from "@/gpu";',
  'import { effect } from "vgpu";',
  "const fence = '```';",
  'document.head.append(Object.assign(document.createElement("style"), { textContent: CSS }));',
].join("\n");
const PROFILE: CodeCard = {
  slug: "buttons/Profile",
  title: "Profile",
  description: "A picture you step into.",
  members: [{ slug: "buttons/Profile", title: "Profile", files: [{ name: "Profile.tsx", code: PROFILE_CODE }] }],
};

describe("componentImports", () => {
  test("names the npm packages and the studio modules a file needs but leaves out, not React", () => {
    const imports = componentImports(PROFILE.members[0]!.files);
    expect(imports.packages).toEqual(["vgpu"]);
    expect([...imports.studio]).toEqual([["@/gpu", ["useGpu", "GpuSession"]]]);
  });
});

describe("codeMarkdown", () => {
  test("says what the component is, that it is one file, what it needs, and gives the file in full", () => {
    const markdown = codeMarkdown(PROFILE, SITE);
    expect(markdown.startsWith("# Profile\n\nA picture you step into.\n")).toBe(true);
    expect(markdown).toContain(`${SITE}/buttons/Profile. It is one React and TypeScript file, \`Profile.tsx\``);
    expect(markdown).toContain("Its styles are a `CSS` string");
    expect(markdown).toContain("- The npm package `vgpu`.");
    expect(markdown).toContain("`useGpu` and `GpuSession` from `@/gpu`");
  });

  test("fences code with more backticks than it holds, so a file cannot end its own block", () => {
    expect(codeMarkdown(PROFILE, SITE)).toContain("## Profile.tsx\n\n````tsx\n");
  });

  test("names a Web Worker that ships beside the component", () => {
    const withWorker: CodeCard = {
      ...PROFILE,
      members: [{ ...PROFILE.members[0]!, files: [...PROFILE.members[0]!.files, { name: "stillWorker.ts", code: "self.onmessage = () => {};\n" }] }],
    };
    const markdown = codeMarkdown(withWorker, SITE);
    expect(markdown).toContain("plus `stillWorker.ts`, the Web Worker it starts, saved beside it.");
    expect(markdown).toContain("## stillWorker.ts\n\n```ts\n");
  });

  test("gives each component on a family card a section of its own", () => {
    const markdown = codeMarkdown(CONTROLS, null);
    expect(markdown).toContain("## Switch\n\n### Switch.tsx");
    expect(markdown).toContain("## Stepper\n\n### Stepper.tsx");
    expect(markdown).toContain("Trev’s Studio, /controls. Each component below is one React and TypeScript file");
    expect(markdown).not.toContain("It also needs");
  });
});
