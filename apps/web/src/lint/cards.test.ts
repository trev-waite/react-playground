import { describe, test } from "bun:test";
import { existsSync } from "node:fs";
import path from "node:path";
import { lineOf, report, SRC, sources } from "./source";

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
    return { ...source, folder, name };
  });
}

function isFamilyFolder(folder: string): boolean {
  return existsSync(path.join(SRC, "live", folder, "family.ts"));
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
      const component = path.join(SRC, "live", folder, name, `${name}.tsx`);
      if (!existsSync(component)) {
        violations.push(`${file} has no ${name}.tsx beside it. The Code sheet and the one-file download start from it.`);
        continue;
      }
      const text = await Bun.file(component).text();
      if (!new RegExp(`^export (?:function|const) ${name}\\b`, "m").test(text)) {
        violations.push(`live/${folder}/${name}/${name}.tsx must export \`${name}\`, the component its preview renders.`);
      }
    }
    report(violations);
  });

  test("a preview types its meta: CardMeta for its own card, FamilyMemberMeta inside a family folder", async () => {
    const violations: string[] = [];
    for (const { file, text, folder, name } of await previews()) {
      if (!folder || !name || folder === KIT) continue;
      const expected = isFamilyFolder(folder) ? "FamilyMemberMeta" : "CardMeta";
      const declared = /^export const meta(?::\s*(\w+))?\s*=/m.exec(text);
      if (!declared) {
        violations.push(
          `${file} exports no \`meta\`. Declare \`export const meta: ${expected} = { … }\`` +
            (expected === "CardMeta" ? " with its description, size, and surface." : " with its title."),
        );
        continue;
      }
      if (declared[1] !== expected) {
        violations.push(
          `${file}:${lineOf(text, declared.index)} declares meta as ${declared[1] ?? "an untyped literal"}; ` +
            `type it \`export const meta: ${expected}\` so the type checker holds it to the card's shape` +
            (expected === "FamilyMemberMeta" ? `, since live/${folder}/family.ts owns the card.` : "."),
        );
        continue;
      }
      if (!new RegExp(`^import type \\{[^}]*\\b${expected}\\b[^}]*\\} from "@/lib/types";`, "m").test(text)) {
        violations.push(`${file} must import ${expected} with \`import type { ${expected} } from "@/lib/types"\`.`);
      }
    }
    report(violations);
  });

  test("a preview's default export renders the component with no props, and it exports nothing else", async () => {
    const violations: string[] = [];
    for (const { file, text, folder, name } of await previews()) {
      if (!folder || !name || folder === KIT) continue;
      const component = new RegExp(`^export default function ${name}Preview\\(\\s*\\)`, "m");
      if (!component.test(text)) {
        violations.push(
          `${file} must \`export default function ${name}Preview()\`, taking no props: the deck mounts it bare, ` +
            "in the grid tile, in flight, and on its page, and remounts it to reset.",
        );
      }
      for (const match of text.matchAll(/^export\s+(?!const meta\b|default function\b)(.*)$/gm)) {
        violations.push(
          `${file}:${lineOf(text, match.index!)} exports "${match[1]!.trim()}". A preview exports only \`meta\` and its ` +
            `default component; put shared code in ${name}.tsx or a file beside it.`,
        );
      }
    }
    report(violations);
  });

  test("a family's family.ts types its meta as FamilyMeta", async () => {
    const violations: string[] = [];
    for (const { file, text } of await sources(["live"], "*/family.ts")) {
      if (!/^export const meta: FamilyMeta = \{/m.test(text) || !/^import type \{ FamilyMeta \} from "@\/lib\/types";/m.test(text)) {
        violations.push(`${file} must declare \`export const meta: FamilyMeta = { … }\`, imported from "@/lib/types".`);
      }
    }
    report(violations);
  });
});
