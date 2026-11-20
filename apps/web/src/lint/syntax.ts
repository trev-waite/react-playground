import ts from "typescript";
import { ALLOW, allowedNear } from "./source";

/** A file parsed by TypeScript, so the lint reads declarations, exports, and JSX rather than lines. */
export function parse(file: string, text: string): ts.SourceFile {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some(modifier => modifier.kind === kind);
}

/** The names a module exports, with `default` for its default export. */
export function exportedNames(source: ts.SourceFile): string[] {
  const names: string[] = [];
  for (const statement of source.statements) {
    if (ts.isExportAssignment(statement)) names.push("default");
    else if (ts.isExportDeclaration(statement)) {
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        names.push(...statement.exportClause.elements.map(element => element.name.text));
      } else names.push("*");
    } else if (hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      if (hasModifier(statement, ts.SyntaxKind.DefaultKeyword)) names.push("default");
      else if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) names.push(declaration.name.getText(source));
      } else if ("name" in statement && statement.name && ts.isIdentifier(statement.name as ts.Node)) {
        names.push((statement.name as ts.Identifier).text);
      }
    }
  }
  return names;
}

/** The exported `const <name>` declaration, if there is one. */
export function exportedConst(source: ts.SourceFile, name: string): ts.VariableDeclaration | undefined {
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement) || !hasModifier(statement, ts.SyntaxKind.ExportKeyword)) continue;
    const found = statement.declarationList.declarations.find(declaration => declaration.name.getText(source) === name);
    if (found) return found;
  }
  return undefined;
}

/** The module's `export default function`, if that is how it exports its default. */
export function defaultFunction(source: ts.SourceFile): ts.FunctionDeclaration | undefined {
  return source.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) &&
      hasModifier(statement, ts.SyntaxKind.ExportKeyword) &&
      hasModifier(statement, ts.SyntaxKind.DefaultKeyword),
  );
}

/** True when `node` renders a JSX element named `tag` anywhere inside it. */
export function rendersElement(node: ts.Node, tag: string): boolean {
  let found = false;
  const visit = (child: ts.Node) => {
    if (found) return;
    if ((ts.isJsxOpeningElement(child) || ts.isJsxSelfClosingElement(child)) && child.tagName.getText() === tag) found = true;
    else ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

/** Named types a module imports from `module`, type-only or not. */
export function importedNames(source: ts.SourceFile, module: string): string[] {
  return source.statements.flatMap(statement => {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return [];
    if (statement.moduleSpecifier.text !== module) return [];
    const bindings = statement.importClause?.namedBindings;
    return bindings && ts.isNamedImports(bindings) ? bindings.elements.map(element => element.name.text) : [];
  });
}

type FunctionLike = ts.FunctionLikeDeclaration;

/** Every function in the file that a call by `name` or `this.name` could reach. */
function declarationsByName(source: ts.SourceFile): Map<string, FunctionLike[]> {
  const byName = new Map<string, FunctionLike[]>();
  const add = (name: string, fn: FunctionLike) => byName.set(name, [...(byName.get(name) ?? []), fn]);
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name) add(node.name.text, node);
    else if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) add(node.name.text, node);
    else if (
      (ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node)) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      add(node.name.text, node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return byName;
}

/** The functions an expression handed to a loop refers to: an inline function, a name, `this.name`, or either with `.bind(…)`. */
function callbackFunctions(expression: ts.Expression, byName: Map<string, FunctionLike[]>): FunctionLike[] {
  let target: ts.Expression = expression;
  while (ts.isParenthesizedExpression(target) || ts.isAsExpression(target) || ts.isNonNullExpression(target)) target = target.expression;
  if (ts.isCallExpression(target) && ts.isPropertyAccessExpression(target.expression) && target.expression.name.text === "bind") {
    target = target.expression.expression;
  }
  if (ts.isArrowFunction(target) || ts.isFunctionExpression(target)) return [target];
  if (ts.isIdentifier(target)) return byName.get(target.text) ?? [];
  if (ts.isPropertyAccessExpression(target) && target.expression.kind === ts.SyntaxKind.ThisKeyword) return byName.get(target.name.text) ?? [];
  return [];
}

/** The name a call reaches into this file by: `name(…)` or `this.name(…)`. */
function calleeName(call: ts.CallExpression): string | undefined {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee) && callee.expression.kind === ts.SyntaxKind.ThisKeyword) return callee.name.text;
  return undefined;
}

const FRAME_SCHEDULERS: Record<string, number> = { requestAnimationFrame: 0, visibleLoop: 1 };

/**
 * The function bodies that run every frame, as offsets into the file: the callback handed to
 * requestAnimationFrame or visibleLoop, in any form, and the functions and methods of this file it
 * calls, two calls deep. A call marked `perf-allow: <reason>` on its line or the one above (one that
 * runs only when something changed, or at most every so often) is not followed.
 */
export function frameBodies(file: string, text: string): { start: number; end: number }[] {
  const source = parse(file, text);
  const byName = declarationsByName(source);
  const seen = new Set<FunctionLike>();
  let frontier: FunctionLike[] = [];
  const visitCalls = (node: ts.Node, onCall: (call: ts.CallExpression) => void) => {
    const visit = (child: ts.Node) => {
      if (ts.isCallExpression(child)) onCall(child);
      ts.forEachChild(child, visit);
    };
    visit(node);
  };
  visitCalls(source, call => {
    const callee = call.expression;
    const name = ts.isIdentifier(callee)
      ? callee.text
      : ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && ["window", "globalThis"].includes(callee.expression.text)
        ? callee.name.text
        : undefined;
    const index = name === undefined ? undefined : FRAME_SCHEDULERS[name];
    const argument = index === undefined ? undefined : call.arguments[index];
    if (!argument) return;
    for (const fn of callbackFunctions(argument, byName)) {
      if (seen.has(fn)) continue;
      seen.add(fn);
      frontier.push(fn);
    }
  });
  for (let hop = 0; hop < 2; hop++) {
    const next: FunctionLike[] = [];
    for (const fn of frontier) {
      if (!fn.body) continue;
      visitCalls(fn.body, call => {
        const name = calleeName(call);
        if (!name || allowedNear(text, call.getStart(source), ALLOW, 1)) return;
        for (const callee of byName.get(name) ?? []) {
          if (seen.has(callee)) continue;
          seen.add(callee);
          next.push(callee);
        }
      });
    }
    frontier = next;
  }
  return [...seen].flatMap(fn => (fn.body ? [{ start: fn.body.getStart(source), end: fn.body.end }] : []));
}
