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

/** The expressions `fn` returns: each `return` of its own (not of functions nested in it), or an arrow's expression body. */
function returnedExpressions(fn: ts.FunctionLikeDeclaration): (ts.Expression | undefined)[] {
  if (!fn.body) return [];
  if (!ts.isBlock(fn.body)) return [fn.body];
  const found: (ts.Expression | undefined)[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isFunctionLike(node) || ts.isClassLike(node)) return;
    if (ts.isReturnStatement(node)) found.push(node.expression);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(fn.body, visit);
  return found;
}

/** True when `expression` is JSX that contains an element whose tag `isTag` accepts, wrapped only by other elements. */
function plainlyContains(expression: ts.Expression, isTag: (tag: ts.JsxTagNameExpression) => boolean): boolean {
  const target = ts.isParenthesizedExpression(expression) ? plainlyContains(expression.expression, isTag) : undefined;
  if (target !== undefined) return target;
  if (ts.isJsxSelfClosingElement(expression)) return isTag(expression.tagName);
  if (ts.isJsxElement(expression)) {
    return isTag(expression.openingElement.tagName) || expression.children.some(child => ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child) || ts.isJsxFragment(child) ? plainlyContains(child, isTag) : false);
  }
  if (ts.isJsxFragment(expression)) {
    return expression.children.some(child => ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child) || ts.isJsxFragment(child) ? plainlyContains(child, isTag) : false);
  }
  return false;
}

/**
 * True when `fn` always renders `name` imported from `module`: it ends in a return, so no path falls
 * through to nothing, and every value it returns is JSX holding that element, wrapped only by other elements, never behind a condition, a call, or braces, and the
 * tag resolves to the import itself rather than anything that shadows it.
 */
export function rendersElement(source: ts.SourceFile, fn: ts.FunctionLikeDeclaration, name: string, module: string): boolean {
  const checker = checkerFor(source);
  const isTag = (tag: ts.JsxTagNameExpression) => {
    if (!ts.isIdentifier(tag) || tag.text !== name) return false;
    const declaration = checker.getSymbolAtLocation(tag)?.declarations?.[0];
    if (!declaration || !ts.isImportSpecifier(declaration)) return false;
    const from = declaration.parent.parent.parent.moduleSpecifier;
    return ts.isStringLiteral(from) && from.text === module && (declaration.propertyName ?? declaration.name).text === name;
  };
  const returns = returnedExpressions(fn);
  const endsInReturn = !!fn.body && (!ts.isBlock(fn.body) || (fn.body.statements.length > 0 && ts.isReturnStatement(fn.body.statements[fn.body.statements.length - 1]!)));
  return endsInReturn && returns.every(expression => !!expression && plainlyContains(expression, isTag));
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

/** The function a declaration holds: a function or method itself, a variable or field initialised with one, or an alias of one. */
function functionOf(checker: ts.TypeChecker, declaration: ts.Declaration, depth = 0): FunctionLike[] {
  if (ts.isFunctionDeclaration(declaration) || ts.isMethodDeclaration(declaration)) return [declaration];
  if ((ts.isVariableDeclaration(declaration) || ts.isPropertyDeclaration(declaration)) && declaration.initializer) {
    const value = unwrap(declaration.initializer);
    if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) return [value];
    if (depth < 3 && (ts.isIdentifier(value) || isThisMember(value))) return resolve(checker, ts.isIdentifier(value) ? value : value.name, depth + 1);
  }
  return [];
}

function isThisMember(node: ts.Node): node is ts.PropertyAccessExpression {
  return ts.isPropertyAccessExpression(node) && node.expression.kind === ts.SyntaxKind.ThisKeyword;
}

/** The functions a name or `this.name` refers to, resolved by the checker. */
function resolve(checker: ts.TypeChecker, node: ts.Node, depth = 0): FunctionLike[] {
  const symbol = checker.getSymbolAtLocation(node);
  return (symbol?.declarations ?? []).flatMap(declaration => functionOf(checker, declaration, depth));
}

/** The functions a call reaches in this file: `name(…)` or `this.name(…)`. */
function calleeFunctions(checker: ts.TypeChecker, call: ts.CallExpression): FunctionLike[] {
  const callee = unwrap(call.expression);
  if (ts.isIdentifier(callee)) return resolve(checker, callee);
  if (isThisMember(callee)) return resolve(checker, callee.name);
  return [];
}

/** The functions an expression handed to a loop runs: an inline function, a name, `this.name`, or either with `.bind(…)`. */
function callbackFunctions(checker: ts.TypeChecker, expression: ts.Expression): FunctionLike[] {
  let target = unwrap(expression);
  if (ts.isCallExpression(target) && ts.isPropertyAccessExpression(target.expression) && target.expression.name.text === "bind") {
    target = unwrap(target.expression.expression);
  }
  if (ts.isArrowFunction(target) || ts.isFunctionExpression(target)) return [target];
  if (ts.isIdentifier(target)) return resolve(checker, target);
  if (isThisMember(target)) return resolve(checker, target.name);
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

/** Calls whose function arguments run later, not during the frame that makes the call. */
const DEFERRING_CALLS = new Set([
  "setTimeout", "setInterval", "requestAnimationFrame", "requestIdleCallback", "queueMicrotask",
  "addEventListener", "then", "catch", "finally", "visibleLoop",
]);

function calledName(call: ts.CallExpression): string | undefined {
  const callee = unwrap(call.expression);
  return ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : undefined;
}

/**
 * True when a function nested in a frame body runs during that frame: an inline callback such as a
 * forEach's. A named function runs only when called (calls are followed on their own), and a callback
 * handed to an observer, a timer, a listener, or a promise runs later.
 */
function runsInline(fn: FunctionLike): boolean {
  if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return false;
  const parent = fn.parent;
  if (ts.isNewExpression(parent)) return false;
  if (ts.isCallExpression(parent) && parent.arguments.includes(fn)) return !DEFERRING_CALLS.has(calledName(parent) ?? "");
  return false;
}

/** Visits the nodes a frame body runs, stepping into inline callbacks and around everything that runs later. */
function walkFrame(body: ts.Node, visit: (node: ts.Node) => void) {
  const step = (node: ts.Node) => {
    if (node !== body && ts.isFunctionLike(node) && !runsInline(node as FunctionLike)) return;
    if (ts.isClassLike(node)) return;
    visit(node);
    ts.forEachChild(node, step);
  };
  step(body);
}

/**
 * The functions that run every frame: the callback handed to requestAnimationFrame or visibleLoop,
 * in any form, and the functions and methods of this file it calls by name or `this.`, two calls
 * deep, each name resolved through its real scope. A call marked `perf-allow: <reason>` on its line
 * or the one above (one that runs only when something changed, or at most every so often) is not
 * followed.
 */
function frameFunctions(source: ts.SourceFile, checker: ts.TypeChecker, text: string): FunctionLike[] {
  const seen = new Set<FunctionLike>();
  const add = (fns: FunctionLike[], into: FunctionLike[]) => {
    for (const fn of fns) {
      if (seen.has(fn)) continue;
      seen.add(fn);
      into.push(fn);
    }
  };
  let frontier: FunctionLike[] = [];
  const findLoops = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const argument = frameArgument(checker, node);
      if (argument) add(callbackFunctions(checker, argument), frontier);
    }
    ts.forEachChild(node, findLoops);
  };
  findLoops(source);
  for (let hop = 0; hop < 2; hop++) {
    const next: FunctionLike[] = [];
    for (const fn of frontier) {
      if (!fn.body) continue;
      walkFrame(fn.body, node => {
        if (!ts.isCallExpression(node) || allowedNear(text, node.getStart(source), ALLOW, 1)) return;
        add(calleeFunctions(checker, node), next);
      });
    }
    frontier = next;
  }
  return [...seen];
}

const LAYOUT_READS = /^(?:client|offset|scroll)(?:Width|Height|Left|Top)$/;

function isAssigned(node: ts.Node): boolean {
  const parent = node.parent;
  return ts.isBinaryExpression(parent) && parent.left === node &&
    parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment;
}

/** True when `receiver` is plain data this file defines (an object literal or a local type), such as cached measurements, not a DOM node. */
function isPlainData(checker: ts.TypeChecker, receiver: ts.Expression): boolean {
  const target = unwrap(receiver);
  const name = ts.isIdentifier(target) ? target : isThisMember(target) ? target.name : undefined;
  const declaration = name && checker.getSymbolAtLocation(name)?.declarations?.[0];
  if (!declaration || !(ts.isVariableDeclaration(declaration) || ts.isPropertyDeclaration(declaration) || ts.isParameter(declaration))) return false;
  if (declaration.initializer && ts.isObjectLiteralExpression(unwrap(declaration.initializer))) return true;
  const type = declaration.type;
  if (!type) return false;
  if (ts.isTypeLiteralNode(type)) return true;
  if (ts.isTypeReferenceNode(type)) {
    const local = checker.getSymbolAtLocation(type.typeName)?.declarations?.[0];
    return !!local && (ts.isInterfaceDeclaration(local) || ts.isTypeAliasDeclaration(local)) && local.getSourceFile() === receiver.getSourceFile();
  }
  return false;
}

/** True when a call updates React state: it is the setter slot of a `useState` or `useReducer` pair, whatever it is named. */
function isStateSetter(checker: ts.TypeChecker, callee: ts.Identifier): boolean {
  const declaration = checker.getSymbolAtLocation(callee)?.declarations?.[0];
  if (!declaration || !ts.isBindingElement(declaration) || !ts.isArrayBindingPattern(declaration.parent)) return false;
  if (declaration.parent.elements.indexOf(declaration) !== 1) return false;
  const holder = declaration.parent.parent;
  if (!ts.isVariableDeclaration(holder) || !holder.initializer) return false;
  const init = unwrap(holder.initializer);
  return ts.isCallExpression(init) && /^use(?:State|Reducer)$/.test(calledName(init) ?? "");
}

export type FrameFinding = { index: number; code: string; fnStart: number };

/** What the frame code in a file does that it should not: layout reads, font changes, and React state updates. */
export function frameFindings(file: string, text: string): { reads: FrameFinding[]; setters: FrameFinding[] } {
  const source = parse(file, text);
  const checker = checkerFor(source);
  const reads: FrameFinding[] = [];
  const setters: FrameFinding[] = [];
  for (const fn of frameFunctions(source, checker, text)) {
    if (!fn.body) continue;
    const fnStart = fn.getStart(source);
    const found = (into: FrameFinding[], node: ts.Node) => into.push({ index: node.getStart(source), code: node.getText(source), fnStart });
    walkFrame(fn.body, node => {
      if (ts.isPropertyAccessExpression(node)) {
        if (LAYOUT_READS.test(node.name.text) && !isAssigned(node) && !isPlainData(checker, node.expression)) found(reads, node);
        else if (node.name.text === "font" && isAssigned(node)) found(reads, node.parent);
      } else if (ts.isCallExpression(node)) {
        const name = calledName(node);
        if (name === "getBoundingClientRect" || name === "getClientRects" || name === "getComputedStyle") found(reads, node);
        const callee = unwrap(node.expression);
        if (ts.isIdentifier(callee) && isStateSetter(checker, callee)) found(setters, node);
      } else if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) {
        const name = (node.propertyName ?? node.name).getText(source);
        const holder = node.parent.parent;
        const from = ts.isVariableDeclaration(holder) ? holder.initializer : undefined;
        if (LAYOUT_READS.test(name) && !(from && isPlainData(checker, from))) found(reads, node);
      }
    });
  }
  return { reads, setters };
}

/**
 * Offsets of timeouts that come back round to themselves: the callback, or a function of this file
 * it calls (by name or `this.`, three calls deep), schedules the same timeout again. Work handed to a
 * listener, an observer, or a promise along the way waits for something else, so it is not followed.
 */
export function selfSchedulingTimeouts(file: string, text: string): number[] {
  const source = parse(file, text);
  const checker = checkerFor(source);
  const found: number[] = [];
  const reaches = (start: FunctionLike[], timeout: ts.CallExpression) => {
    const seen = new Set<FunctionLike>();
    let frontier = start;
    for (let hop = 0; hop < 4 && frontier.length > 0; hop++) {
      const next: FunctionLike[] = [];
      for (const fn of frontier) {
        if (seen.has(fn) || !fn.body) continue;
        seen.add(fn);
        let hit = false;
        walkFrame(fn.body, node => {
          if (node === timeout) hit = true;
          else if (ts.isCallExpression(node)) next.push(...calleeFunctions(checker, node));
        });
        if (hit) return true;
      }
      frontier = next;
    }
    return false;
  };
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && calledName(node) === "setTimeout" && node.arguments[0]) {
      const callback = unwrap(node.arguments[0]);
      const start = ts.isArrowFunction(callback) || ts.isFunctionExpression(callback) ? [callback] : callbackFunctions(checker, callback);
      const inline = start.filter(fn => fn === callback);
      const named = start.filter(fn => fn !== callback);
      const fromInline = inline.flatMap(fn => {
        const callees: FunctionLike[] = [];
        if (fn.body) walkFrame(fn.body, child => ts.isCallExpression(child) && callees.push(...calleeFunctions(checker, child)));
        return callees;
      });
      if (reaches([...named, ...fromInline], node)) found.push(node.getStart(source));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}
