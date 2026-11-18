import { livePath, SITE_TITLE } from "../src/lib/liveRoutes.ts";
import type { SourceFile } from "../src/lib/types.ts";

/** A card's components and their files, as its code is published. */
export type CodeCard = {
  slug: string;
  title: string;
  description?: string;
  members: { slug: string; title: string; files: SourceFile[] }[];
};

/** What a component's files import that they do not include. */
export type ComponentImports = {
  /** npm packages, other than React itself. */
  packages: string[];
  /** The studio's own modules, which the published code leaves out, with the names taken from each. */
  studio: Map<string, string[]>;
};

const IMPORT = /\bimport\s+(type\s+)?(?:([^;"']*?)\s+from\s+)?["']([^"']+)["']/g;
const REACT = new Set(["react", "react-dom"]);

function importedNames(clause: string | undefined): string[] {
  const named = clause?.match(/\{([\s\S]*)\}/)?.[1];
  if (!named) return [];
  return named
    .split(",")
    .map(name => name.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0]!)
    .filter(Boolean);
}

function packageName(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
}

export function componentImports(files: readonly SourceFile[]): ComponentImports {
  const packages = new Set<string>();
  const studio = new Map<string, Set<string>>();
  for (const file of files) {
    for (const [, , clause, specifier] of file.code.matchAll(IMPORT)) {
      if (!specifier || specifier.startsWith(".")) continue;
      if (specifier.startsWith("@/") || specifier.startsWith("@react-playground/")) {
        const names = studio.get(specifier) ?? new Set();
        for (const name of importedNames(clause)) names.add(name);
        studio.set(specifier, names);
      } else if (!REACT.has(packageName(specifier))) {
        packages.add(packageName(specifier));
      }
    }
  }
  return {
    packages: [...packages].sort(),
    studio: new Map([...studio].sort(([a], [b]) => a.localeCompare(b)).map(([module, names]) => [module, [...names]])),
  };
}

/** A fence longer than any run of backticks in the code, so the code cannot close it. */
function fence(code: string): string {
  const longest = Math.max(0, ...Array.from(code.matchAll(/`+/g), run => run[0].length));
  return "`".repeat(Math.max(3, longest + 1));
}

function language(name: string): string {
  return name.endsWith(".css") ? "css" : name.endsWith(".tsx") ? "tsx" : "ts";
}

function fileSection(file: SourceFile, heading: string): string {
  const marks = fence(file.code);
  return `${heading} ${file.name}\n\n${marks}${language(file.name)}\n${file.code.replace(/\n$/, "")}\n${marks}\n`;
}

function list(items: readonly string[]): string {
  return items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

const STYLE_INJECTION = 'document.createElement("style")';

function shape(card: CodeCard): string {
  if (card.members.length > 1) {
    return "Each component below is one React and TypeScript file of its own, with its helpers and styles inlined.";
  }
  const [main, ...rest] = card.members[0]?.files ?? [];
  const extra = rest.length ? `, plus ${list(rest.map(file => `\`${file.name}\``))}, the Web Worker it starts, saved beside it` : "";
  return `It is one React and TypeScript file, \`${main?.name}\`, with its helpers, styles, and any other ${SITE_TITLE} component it uses inlined${extra}.`;
}

/**
 * A card's code as one Markdown file: what the component is, what it needs
 * that the file leaves out, and each file in full. Written for a person or an
 * agent rebuilding it elsewhere. Links are absolute when the site's origin is known.
 */
export function codeMarkdown(card: CodeCard, siteUrl: string | null): string {
  const origin = siteUrl ?? "";
  const family = card.members.length > 1;
  const files = card.members.flatMap(member => member.files);
  const imports = componentImports(files);

  const lines = [`# ${card.title}`, ""];
  if (card.description) lines.push(card.description, "");
  lines.push(
    `The source of ${card.title} from ${SITE_TITLE}, ${origin}${livePath(card.slug)}. ${shape(card)}`,
    "",
    "Use it as is: keep its look, behavior, motion, and accessibility identical rather than restyling it to the project it goes into, change only what it needs to run there, then compare it with the live version at the link above.",
    "",
  );
  if (files.some(file => file.code.includes(STYLE_INJECTION))) {
    lines.push("Its styles are a `CSS` string at the end of the file, added to the page once; keep them as they are.", "");
  }

  const needs = [
    ...imports.packages.map(name => `- The npm package \`${name}\`.`),
    ...[...imports.studio].map(([module, names]) => {
      const what = names.length ? `${list(names.map(name => `\`${name}\``))} from \`${module}\`` : `\`${module}\``;
      return `- ${what}, the studio's own code, not included here: recreate exactly what the component uses, so it behaves the same.`;
    }),
  ];
  if (needs.length) lines.push("It also needs:", "", ...needs, "");

  for (const member of card.members) {
    if (family) lines.push(`## ${member.title}`, "");
    for (const file of member.files) lines.push(fileSection(file, family ? "###" : "##"));
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
