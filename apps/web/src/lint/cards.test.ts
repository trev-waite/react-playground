import { describe, test } from "bun:test";
import { existsSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { lineOf, report, SRC, sources } from "./source";
import { defaultFunction, exportedConst, exportedNames, importedNames, importsAsItself, parse, rendersElement } from "./syntax";

/**
 * The card contract. The deck opens, flies, fits, pages, resets, and publishes every Live
 * component the same way, from nothing but its folder: a `preview.tsx` whose `meta` places
 * the card and whose default export renders the component with no props. These rules hold
 * every new component to that slot, so it behaves like the cards beside it without the deck
 * knowing it exists.
 */

const PREVIEW = /^live\/([^/]+)\/([^/]+)\/preview\.tsx$/;
const KIT = "kit";

async function previews() {
  return (await sources(["live"], "**/preview.tsx")).map(source => {
    const [, folder, name] = PREVIEW.exec(source.file) ?? [];
    return { ...source, folder, name, syntax: parse(source.file, source.text) };
  });
}

function isFamilyFolder(folder: string): boolean {
  return existsSync(path.join(SRC, "live", folder, "family.ts"));
}

function same(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

describe("card contract", () => {
  test("each preview sits at live/<folder>/<Name>/preview.tsx, beside the <Name>.tsx that exports <Name>", async () => {
    const violations: string[] = [];
    for (const { file, folder, name } of await previews()) {
      if (!folder || !name) {
        violations.push(`${file} is not at live/<folder>/<Name>/preview.tsx, so it has no slug or page.`);
        continue;
      }
      if (folder === KIT) {
        violations.push(`${file}: live/kit holds the shared parts components build on, never a card.`);
        continue;
      }
      if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) {
        violations.push(`${file}: the component folder "${name}" must be its PascalCase name, which is also its URL.`);
        continue;
      }
      const component = `live/${folder}/${name}/${name}.tsx`;
      if (!existsSync(path.join(SRC, component))) {
        violations.push(`${file} has no ${name}.tsx beside it. The Code sheet and the one-file download start from it.`);
        continue;
      }
      if (!exportedNames(parse(component, await Bun.file(path.join(SRC, component)).text())).includes(name)) {
        violations.push(`${component} must export \`${name}\`, the component its preview renders.`);
      }
    }
    report(violations);
  });

  test("each component folder in Live has a preview, so it gets a card and a page", async () => {
    const violations: string[] = [];
    for (const { file } of await sources(["live"], "*/*/*.tsx")) {
      const [, folder, name, base] = /^live\/([^/]+)\/([^/]+)\/([^/]+)\.tsx$/.exec(file) ?? [];
      if (!folder || !name || folder === KIT || name !== base) continue;
      if (!existsSync(path.join(SRC, "live", folder, name, "preview.tsx"))) {
        violations.push(`${file} has no preview.tsx beside it, so the deck never shows it. Add one (see the new-component skill).`);
      }
    }
    report(violations);
  });

  test("a preview types its meta: CardMeta for its own card, FamilyMemberMeta inside a family folder", async () => {
    const violations: string[] = [];
    for (const { file, text, folder, name, syntax } of await previews()) {
      if (!folder || !name || folder === KIT) continue;
      const expected = isFamilyFolder(folder) ? "FamilyMemberMeta" : "CardMeta";
      const meta = exportedConst(syntax, "meta");
      if (!meta) {
        violations.push(
          `${file} exports no \`meta\`. Declare \`export const meta: ${expected} = { … }\`` +
            (expected === "CardMeta" ? " with its description, size, and surface." : " with its title."),
        );
        continue;
      }
      const type = meta.type && ts.isTypeReferenceNode(meta.type) ? meta.type.typeName.getText(syntax) : undefined;
      if (type !== expected || !meta.initializer || !ts.isObjectLiteralExpression(meta.initializer)) {
        violations.push(
          `${file}:${lineOf(text, meta.getStart(syntax))} declares meta as ${type ?? "an untyped value"}; ` +
            `write \`export const meta: ${expected} = { … }\` so the type checker holds it to the card's shape` +
            (expected === "FamilyMemberMeta" ? `, since live/${folder}/family.ts owns the card.` : "."),
        );
        continue;
      }
      if (!importedNames(syntax, "@/lib/types").includes(expected)) {
        violations.push(`${file} must import ${expected} with \`import type { ${expected} } from "@/lib/types"\`.`);
      }
    }
    report(violations);
  });

  test("a preview exports only meta and a default <Name>Preview() that takes no props and renders <Name>", async () => {
    const violations: string[] = [];
    for (const { file, folder, name, syntax } of await previews()) {
      if (!folder || !name || folder === KIT) continue;
      const exported = exportedNames(syntax);
      if (!same(exported, ["meta", "default"])) {
        violations.push(
          `${file} exports ${exported.join(", ") || "nothing"}. A preview exports only \`meta\` and its default ` +
            `component; put shared code in ${name}.tsx or a file beside it.`,
        );
      }
      const preview = defaultFunction(syntax);
      if (!preview || preview.name?.text !== `${name}Preview` || preview.parameters.length > 0) {
        violations.push(
          `${file} must \`export default function ${name}Preview()\`, taking no props: the deck mounts it bare, ` +
            "in the grid tile, in flight, and on its page, and remounts it to reset.",
        );
      } else if (!importsAsItself(syntax, name, `./${name}`) || !rendersElement(syntax, preview, name, `./${name}`)) {
        violations.push(
          `${file}: ${name}Preview() must import { ${name} } from "./${name}" and end by returning JSX with exactly one <${name} /> ` +
            "in it, as every return must (layout wrappers and other controls are fine; a condition, an early return of something " +
            "else, a hidden or inert wrapper, or a second copy is not), so the card, its code, and its download are the same thing.",
        );
      }
    }
    report(violations);
  });

  test("a family's family.ts exports only its meta, typed FamilyMeta", async () => {
    const violations: string[] = [];
    for (const { file, text } of await sources(["live"], "*/family.ts")) {
      const syntax = parse(file, text);
      const meta = exportedConst(syntax, "meta");
      const type = meta?.type && ts.isTypeReferenceNode(meta.type) ? meta.type.typeName.getText(syntax) : undefined;
      if (!same(exportedNames(syntax), ["meta"]) || type !== "FamilyMeta" || !importedNames(syntax, "@/lib/types").includes("FamilyMeta")) {
        violations.push(`${file} must export only \`export const meta: FamilyMeta = { … }\`, imported from "@/lib/types".`);
      }
    }
    report(violations);
  });
});
