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

const PLAIN_JSX_PARENTS = new Set([
  ts.SyntaxKind.JsxElement,
  ts.SyntaxKind.JsxFragment,
  ts.SyntaxKind.ParenthesizedExpression,
  ts.SyntaxKind.ReturnStatement,
  ts.SyntaxKind.Block,
]);

/**
 * True when `fn` always renders a JSX element named `tag`: one inside the JSX it returns, wrapped only
 * by other elements, never behind a condition, a call, or an expression in braces.
 */
export function rendersElement(fn: ts.FunctionLikeDeclaration, tag: string): boolean {
  let found = false;
  const plainlyReturned = (element: ts.Node) => {
    let node: ts.Node = ts.isJsxOpeningElement(element) ? element.parent : element;
    for (let parent = node.parent; parent && parent !== fn; node = parent, parent = parent.parent) {
      if (!PLAIN_JSX_PARENTS.has(parent.kind)) return false;
    }
    return node === fn.body;
  };
  const visit = (child: ts.Node) => {
    if (found) return;
    if ((ts.isJsxOpeningElement(child) || ts.isJsxSelfClosingElement(child)) && child.tagName.getText() === tag && plainlyReturned(child)) {
      found = true;
    } else ts.forEachChild(child, visit);
  };
  if (fn.body) visit(fn.body);
  return found;
}

/** True when the module imports `name` as itself, unrenamed, from `module`. */
export function importsAsItself(source: ts.SourceFile, name: string, module: string): boolean {
  return source.statements.some(statement => {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return false;
    if (statement.moduleSpecifier.text !== module || statement.importClause?.isTypeOnly) return false;
    const bindings = statement.importClause?.namedBindings;
    return !!bindings && ts.isNamedImports(bindings) &&
      bindings.elements.some(element => element.name.text === name && (!element.propertyName || element.propertyName.text === name));
  });
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

/** A one-file program, so names resolve through real scopes and imports without loading anything else. */
function checkerFor(source: ts.SourceFile): ts.TypeChecker {
  const host: ts.CompilerHost = {
    getSourceFile: name => (name === source.fileName ? source : undefined),
    writeFile: () => {},
    getDefaultLibFileName: () => "lib.d.ts",
    useCaseSensitiveFileNames: () => true,
    getCanonicalFileName: name => name,
    getCurrentDirectory: () => "",
    getNewLine: () => "\n",
    fileExists: name => name === source.fileName,
    readFile: () => undefined,
  };
  return ts.createProgram([source.fileName], { noLib: true, noResolve: true, jsx: ts.JsxEmit.Preserve }, host).getTypeChecker();
}

function unwrap(expression: ts.Expression): ts.Expression {
  let target = expression;
  while (
    ts.isParenthesizedExpression(target) ||
    ts.isAsExpression(target) ||
    ts.isSatisfiesExpression(target) ||
    ts.isTypeAssertionExpression(target) ||
    ts.isNonNullExpression(target)
  ) {
    target = target.expression;
  }
  return target;
}

/** The function a declaration holds: a function or method itself, or a variable or field initialised with one. */
function functionOf(declaration: ts.Declaration): FunctionLike | undefined {
  if (ts.isFunctionDeclaration(declaration) || ts.isMethodDeclaration(declaration)) return declaration;
  if ((ts.isVariableDeclaration(declaration) || ts.isPropertyDeclaration(declaration)) && declaration.initializer) {
    const value = unwrap(declaration.initializer);
    if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) return value;
  }
  return undefined;
}

/** The functions a name or `this.name` refers to, resolved by the checker. */
function resolve(checker: ts.TypeChecker, node: ts.Node): FunctionLike[] {
  const symbol = checker.getSymbolAtLocation(node);
  return (symbol?.declarations ?? []).flatMap(declaration => functionOf(declaration) ?? []);
}

/** The functions an expression handed to a loop runs: an inline function, a name, `this.name`, or either with `.bind(…)`. */
function callbackFunctions(checker: ts.TypeChecker, expression: ts.Expression): FunctionLike[] {
  let target = unwrap(expression);
  if (ts.isCallExpression(target) && ts.isPropertyAccessExpression(target.expression) && target.expression.name.text === "bind") {
    target = unwrap(target.expression.expression);
  }
  if (ts.isArrowFunction(target) || ts.isFunctionExpression(target)) return [target];
  if (ts.isIdentifier(target)) return resolve(checker, target);
  if (ts.isPropertyAccessExpression(target) && target.expression.kind === ts.SyntaxKind.ThisKeyword) return resolve(checker, target.name);
  return [];
}

/** Which argument of a call is a frame callback: `requestAnimationFrame(cb)` or the kit's `visibleLoop(target, cb)`, however it was imported. */
function frameArgument(checker: ts.TypeChecker, call: ts.CallExpression): ts.Expression | undefined {
  const callee = unwrap(call.expression);
  if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && ["window", "globalThis"].includes(callee.expression.text)) {
    return callee.name.text === "requestAnimationFrame" ? call.arguments[0] : undefined;
  }
  if (!ts.isIdentifier(callee)) return undefined;
  const symbol = checker.getSymbolAtLocation(callee);
  const declaration = symbol?.declarations?.[0];
  if (!declaration) return callee.text === "requestAnimationFrame" ? call.arguments[0] : undefined;
  if (ts.isImportSpecifier(declaration)) {
    const from = declaration.parent.parent.parent.moduleSpecifier;
    const imported = (declaration.propertyName ?? declaration.name).text;
    if (imported === "visibleLoop" && ts.isStringLiteral(from) && /(^|\/)kit\/visibleLoop$/.test(from.text)) return call.arguments[1];
  }
  return undefined;
}

/**
 * The function bodies that run every frame, as offsets into the file: the callback handed to
 * requestAnimationFrame or visibleLoop, in any form, and the functions and methods of this file it
 * calls by name or `this.`, two calls deep, each name resolved through its real scope. A call marked
 * `perf-allow: <reason>` on its line or the one above (one that runs only when something changed, or
 * at most every so often) is not followed.
 */
export function frameBodies(file: string, text: string): { start: number; end: number }[] {
  const source = parse(file, text);
  const checker = checkerFor(source);
  const seen = new Set<FunctionLike>();
  let frontier: FunctionLike[] = [];
  const visitCalls = (node: ts.Node, onCall: (call: ts.CallExpression) => void) => {
    const visit = (child: ts.Node) => {
      if (ts.isCallExpression(child)) onCall(child);
      ts.forEachChild(child, visit);
    };
    visit(node);
  };
  const add = (fns: FunctionLike[], into: FunctionLike[]) => {
    for (const fn of fns) {
      if (seen.has(fn)) continue;
      seen.add(fn);
      into.push(fn);
    }
  };
  visitCalls(source, call => {
    const argument = frameArgument(checker, call);
    if (argument) add(callbackFunctions(checker, argument), frontier);
  });
  for (let hop = 0; hop < 2; hop++) {
    const next: FunctionLike[] = [];
    for (const fn of frontier) {
      if (!fn.body) continue;
      visitCalls(fn.body, call => {
        if (allowedNear(text, call.getStart(source), ALLOW, 1)) return;
        const callee = unwrap(call.expression);
        if (ts.isIdentifier(callee)) add(resolve(checker, callee), next);
        else if (ts.isPropertyAccessExpression(callee) && callee.expression.kind === ts.SyntaxKind.ThisKeyword) add(resolve(checker, callee.name), next);
      });
    }
    frontier = next;
  }
  return [...seen].flatMap(fn => (fn.body ? [{ start: fn.body.getStart(source), end: fn.body.end }] : []));
}

/** The function a timeout runs: `name`, `this.name`, or an inline function that only calls one of those. */
function scheduledName(callback: ts.Expression): string | undefined {
  if (ts.isIdentifier(callback)) return callback.text;
  if (ts.isPropertyAccessExpression(callback)) return callback.name.text;
  if (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) {
    const body = callback.body;
    const only = ts.isBlock(body) ? (body.statements.length === 1 ? body.statements[0] : undefined) : body;
    const expression = only && ts.isExpressionStatement(only) ? only.expression : only && ts.isExpression(only) ? only : undefined;
    if (expression && ts.isCallExpression(expression)) return scheduledName(unwrap(expression.expression));
  }
  return undefined;
}

/** Offsets of `setTimeout(…)` calls that schedule the function they run in: a loop on timers rather than the kit. */
export function selfSchedulingTimeouts(file: string, text: string): number[] {
  const source = parse(file, text);
  const found: number[] = [];
  const visit = (node: ts.Node, enclosing: string[]) => {
    let names = enclosing;
    if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && node.name && ts.isIdentifier(node.name)) {
      names = [...enclosing, node.name.text];
    } else if (
      (ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node)) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      names = [...enclosing, node.name.text];
    }
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const isTimeout =
        (ts.isIdentifier(callee) && callee.text === "setTimeout") ||
        (ts.isPropertyAccessExpression(callee) && callee.name.text === "setTimeout");
      const first = node.arguments[0] && unwrap(node.arguments[0]);
      const target = first && scheduledName(first);
      if (isTimeout && target && names.includes(target)) found.push(node.getStart(source));
    }
    ts.forEachChild(node, child => visit(child, names));
  };
  visit(source, []);
  return found;
}
