import { readFile } from "node:fs/promises";
import { parseSync, type ESTree, type Plugin } from "vite";

const META_QUERY = "?meta";

/**
 * Reads `export const meta = { … }` from a Live preview without running it.
 * The deck lays out every card from its meta before any component loads, so
 * meta must be a plain literal.
 */
export function previewMeta(code: string, filename: string): unknown {
  const { program, errors } = parseSync(filename, code);
  if (errors.length) throw new Error(`${filename}: ${errors[0]!.message}`);
  for (const statement of program.body) {
    if (statement.type !== "ExportNamedDeclaration" || statement.declaration?.type !== "VariableDeclaration") continue;
    for (const declarator of statement.declaration.declarations) {
      if (declarator.id.type === "Identifier" && declarator.id.name === "meta" && declarator.init) {
        return literal(declarator.init, filename);
      }
    }
  }
  return undefined;
}

function literal(node: ESTree.Expression, filename: string): unknown {
  switch (node.type) {
    case "Literal":
      return node.value;
    case "TemplateLiteral":
      if (node.expressions.length === 0) return node.quasis[0]?.value.cooked;
      break;
    case "UnaryExpression":
      if (node.operator === "-" && node.argument.type === "Literal" && typeof node.argument.value === "number") {
        return -node.argument.value;
      }
      break;
    case "ArrayExpression":
      return node.elements.map(element =>
        element && element.type !== "SpreadElement" ? literal(element, filename) : invalid(node, filename),
      );
    case "ObjectExpression": {
      const value: Record<string, unknown> = {};
      for (const property of node.properties) {
        if (property.type !== "Property" || property.computed || property.kind !== "init" || property.method) {
          return invalid(property, filename);
        }
        const key = property.key.type === "Identifier" ? property.key.name : property.key.type === "Literal" ? String(property.key.value) : null;
        if (key == null) return invalid(property, filename);
        value[key] = literal(property.value as ESTree.Expression, filename);
      }
      return value;
    }
    case "TSAsExpression":
    case "TSSatisfiesExpression":
    case "ParenthesizedExpression":
      return literal(node.expression, filename);
  }
  return invalid(node, filename);
}

function invalid(node: { start: number }, filename: string): never {
  throw new Error(
    `${filename}: \`meta\` must be a plain literal (offset ${node.start}). The deck reads it before the component loads, so it cannot use variables or calls.`,
  );
}

/**
 * Serves `preview.tsx?meta` as just its meta, so the catalog can import every
 * card's presentation up front and load each component on its own.
 */
export function previewMetaPlugin(): Plugin {
  return {
    name: "preview-meta",
    async load(id) {
      if (!id.endsWith(`/preview.tsx${META_QUERY}`)) return;
      const file = id.slice(0, -META_QUERY.length);
      const meta = previewMeta(await readFile(file, "utf8"), file);
      return `export const meta = ${JSON.stringify(meta)};\n`;
    },
  };
}
