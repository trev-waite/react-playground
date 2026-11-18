import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import type { SourceFile } from "../src/lib/types.ts";

const EXTENSIONS = ["", ".tsx", ".ts"];
const WORKER = /new\s+Worker\(\s*new\s+URL\(\s*["'](\.\/[^"']+)["']/g;

type Edit = { start: number; end: number; text: string };

type ScriptModule = {
  kind: "script";
  file: string;
  source: ts.SourceFile;
  imports: ts.ImportDeclaration[];
  /** Names the module declares at its top level. */
  names: string[];
  deps: string[];
};

type StyleModule = { kind: "style"; file: string; css: string };

type Module = ScriptModule | StyleModule;

function resolve(from: string, specifier: string, liveDir: string): string | null {
  const base = specifier.startsWith("@/live/")
    ? path.join(liveDir, specifier.slice("@/live/".length))
    : specifier.startsWith("./")
      ? path.join(path.dirname(from), specifier)
      : null;
  if (!base) return null;
  for (const extension of EXTENSIONS) {
    if (existsSync(base + extension) && !(base + extension).endsWith("/preview.tsx") && path.extname(base + extension)) return base + extension;
  }
  return null;
}

function topLevelNames(source: ts.SourceFile): string[] {
  const names: string[] = [];
  const bind = (name: ts.BindingName) => {
    if (ts.isIdentifier(name)) names.push(name.text);
    else for (const element of name.elements) if (!ts.isOmittedExpression(element)) bind(element.name);
  };
  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) bind(declaration.name);
    else if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name
    ) {
      names.push(statement.name.text);
    }
  }
  return names;
}

function specifierOf(declaration: ts.ImportDeclaration | ts.ExportDeclaration): string | null {
  const specifier = declaration.moduleSpecifier;
  return specifier && ts.isStringLiteral(specifier) ? specifier.text : null;
}

/** The modules a component's entry reaches: its own files, and other Live components it imports, which are inlined too. Workers stay apart. */
async function readModules(entry: string, liveDir: string, workers: Set<string>): Promise<Map<string, Module>> {
  const modules = new Map<string, Module>();
  const visit = async (file: string) => {
    if (modules.has(file)) return;
    const text = await readFile(file, "utf8");
    if (file.endsWith(".css")) {
      modules.set(file, { kind: "style", file, css: text });
      return;
    }
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    for (const [, worker] of text.matchAll(WORKER)) {
      const resolved = resolve(file, worker!, liveDir);
      if (resolved) workers.add(resolved);
    }
    const imports = source.statements.filter(ts.isImportDeclaration);
    const module: ScriptModule = { kind: "script", file, source, imports, names: topLevelNames(source), deps: [] };
    modules.set(file, module);
    const reexports = source.statements.filter(ts.isExportDeclaration);
    for (const declaration of [...imports, ...reexports]) {
      const specifier = specifierOf(declaration);
      const resolved = specifier ? resolve(file, specifier, liveDir) : null;
      if (!resolved || workers.has(resolved)) continue;
      module.deps.push(resolved);
      await visit(resolved);
    }
  };
  await visit(entry);
  return modules;
}

function order(modules: Map<string, Module>, entry: string): Module[] {
  const ordered: Module[] = [];
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const module = modules.get(file)!;
    if (module.kind === "script") module.deps.forEach(visit);
    ordered.push(module);
  };
  visit(entry);
  return ordered;
}

function kebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function baseName(file: string): string {
  return path.basename(file).replace(/\.module\.css$|\.tsx?$/, "");
}

/** `.class` and `@keyframes` names of a CSS module, scoped under `prefix` as the build would hash them. */
export function scopeCss(css: string, prefix: string): { css: string; classes: Map<string, string> } {
  const classes = new Map<string, string>();
  const keyframes = new Map<string, string>();
  const protect = /\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|url\([^)]*\)/g;
  const parts = css.split(protect);
  const kept = css.match(protect) ?? [];
  // Checked outside comments and strings, as a CSS module reads them: a property CSS modules compose with, in any case
  // or spelling they accept, or a :global / :local selector.
  const code = parts.join(" ");
  if (/:(?:global|local)\b/i.test(code) || /(?:^|[\s;{])(?:composes|compose-with)\s*:/i.test(code)) {
    throw new Error(`${prefix}: :global, :local, and composes cannot be inlined into one file yet`);
  }
  for (const part of parts) {
    for (const [, name] of part.matchAll(/@keyframes\s+([\w-]+)/g)) keyframes.set(name!, `${prefix}-${name}`);
    for (const [, name] of part.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) if (!classes.has(name!)) classes.set(name!, `${prefix}-${name}`);
  }
  const scoped = parts.map(part =>
    part
      .replace(/\.(-?[_a-zA-Z][\w-]*)/g, (_, name: string) => `.${classes.get(name) ?? name}`)
      .replace(/@keyframes\s+([\w-]+)/g, (_, name: string) => `@keyframes ${keyframes.get(name)}`)
      .replace(/(animation(?:-name)?\s*:)([^;}]*)/g, (_, property: string, value: string) =>
        property + value.replace(/[\w-]+/g, word => keyframes.get(word) ?? word),
      ),
  );
  return { css: scoped.map((part, index) => part + (kept[index] ?? "")).join(""), classes };
}

function propertyKey(name: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
}

function templateLiteral(text: string): string {
  return `\`${text.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${")}\``;
}

type ExternalImport = { defaultName?: string; namespace?: string; named: Map<string, { local: string; type: boolean }>; typeOnly: boolean };

function collectExternal(externals: Map<string, ExternalImport>, declaration: ts.ImportDeclaration, specifier: string) {
  const clause = declaration.importClause;
  const entry: ExternalImport = externals.get(specifier) ?? { named: new Map(), typeOnly: true };
  externals.set(specifier, entry);
  if (!clause) {
    entry.typeOnly = false;
    return;
  }
  const declarationType = clause.isTypeOnly;
  if (!declarationType) entry.typeOnly = false;
  if (clause.name) entry.defaultName = clause.name.text;
  const bindings = clause.namedBindings;
  if (bindings && ts.isNamespaceImport(bindings)) entry.namespace = bindings.name.text;
  if (bindings && ts.isNamedImports(bindings)) {
    for (const element of bindings.elements) {
      const imported = (element.propertyName ?? element.name).text;
      const key = `${imported} as ${element.name.text}`;
      const type = declarationType || element.isTypeOnly;
      const known = entry.named.get(key);
      entry.named.set(key, { local: element.name.text, type: known ? known.type && type : type });
      if (!type) entry.typeOnly = false;
    }
  }
}

function renderExternal(specifier: string, entry: ExternalImport): string {
  const named = [...entry.named].map(([key, { type }]) => {
    const [imported, local] = key.split(" as ") as [string, string];
    const name = imported === local ? imported : `${imported} as ${local}`;
    return entry.typeOnly ? name : `${type ? "type " : ""}${name}`;
  });
  const parts = [entry.defaultName, entry.namespace ? `* as ${entry.namespace}` : null, named.length ? `{ ${named.join(", ")} }` : null].filter(Boolean);
  if (parts.length === 0) return `import "${specifier}";`;
  return `import ${entry.typeOnly ? "type " : ""}${parts.join(", ")} from "${specifier}";`;
}

/** Renames identifiers in `source` by `renames`, leaving property names alone. */
function renameEdits(source: ts.SourceFile, renames: Map<string, string>): Edit[] {
  const edits: Edit[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isIdentifier(node) && renames.has(node.text)) {
      const parent = node.parent;
      const to = renames.get(node.text)!;
      const isName = (owner: ts.Node & { name?: ts.Node }) => owner.name === node;
      if (ts.isShorthandPropertyAssignment(parent)) {
        edits.push({ start: node.getStart(), end: node.end, text: `${node.text}: ${to}` });
      } else if (ts.isBindingElement(parent) && parent.name === node && !parent.propertyName && ts.isObjectBindingPattern(parent.parent)) {
        edits.push({ start: node.getStart(), end: node.end, text: `${node.text}: ${to}` });
      } else if (
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        (ts.isQualifiedName(parent) && parent.right === node) ||
        (ts.isBindingElement(parent) && parent.propertyName === node) ||
        ((ts.isPropertyAssignment(parent) ||
          ts.isPropertySignature(parent) ||
          ts.isPropertyDeclaration(parent) ||
          ts.isMethodDeclaration(parent) ||
          ts.isMethodSignature(parent) ||
          ts.isGetAccessor(parent) ||
          ts.isSetAccessor(parent) ||
          ts.isEnumMember(parent) ||
          ts.isJsxAttribute(parent) ||
          ts.isLabeledStatement(parent)) &&
          isName(parent))
      ) {
        // A property's own name, not the binding.
      } else {
        edits.push({ start: node.getStart(), end: node.end, text: to });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return edits;
}

function declaredNames(statement: ts.Statement): ts.Identifier[] {
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.flatMap(declaration => (ts.isIdentifier(declaration.name) ? [declaration.name] : []));
  }
  if (
    (ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement)) &&
    statement.name
  ) {
    return [statement.name];
  }
  return [];
}

/**
 * Drops top-level declarations nothing in the file uses: helpers a module
 * exported for its tests or for other components. Repeats until none is left,
 * since dropping one can leave another unused.
 */
function dropUnused(code: string, fileName: string): string {
  for (;;) {
    const source = ts.createSourceFile(fileName, code, ts.ScriptTarget.Latest, true, fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const uses = new Map<string, number>();
    const count = (node: ts.Node) => {
      if (ts.isIdentifier(node)) uses.set(node.text, (uses.get(node.text) ?? 0) + 1);
      ts.forEachChild(node, count);
    };
    count(source);
    const unused = source.statements.filter(statement => {
      const exported = ts.canHaveModifiers(statement) && ts.getModifiers(statement)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);
      const names = declaredNames(statement);
      return !exported && names.length > 0 && names.every(name => uses.get(name.text) === 1);
    });
    if (unused.length === 0) return code;
    code = applyEdits(
      code,
      unused.map(statement => {
        let end = statement.end;
        while (code[end] === "\n") end++;
        const comments = ts.getLeadingCommentRanges(code, statement.getFullStart());
        return { start: comments?.[0]?.pos ?? statement.getStart(), end, text: "" };
      }),
    );
  }
}

function applyEdits(text: string, edits: Edit[]): string {
  let result = text;
  for (const edit of edits.toSorted((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  return result;
}

/** A statement's text range, with the line break after it. */
function statementRange(statement: ts.Statement, text: string): { start: number; end: number } {
  let end = statement.end;
  while (text[end] === "\n" || text[end] === "\r") end++;
  return { start: statement.getStart(), end };
}

/**
 * One file from a module graph that starts at `entry`: every module it imports
 * from its own folder or another Live component, in dependency order, with
 * clashing top-level names renamed, imports merged, and CSS modules turned into
 * a class map and a stylesheet the file adds to the page once.
 */
async function bundle(entry: string, liveDir: string, workers: Set<string>, outName: string): Promise<SourceFile> {
  const modules = await readModules(entry, liveDir, workers);
  const ordered = order(modules, entry);
  const scripts = ordered.filter((module): module is ScriptModule => module.kind === "script");
  const externals = new Map<string, ExternalImport>();
  const kept: string[] = [];

  for (const module of scripts) {
    for (const declaration of module.imports) {
      const specifier = specifierOf(declaration)!;
      const resolved = resolve(module.file, specifier, liveDir);
      if (resolved && workers.has(resolved)) kept.push(declaration.getText());
      else if (!resolved) collectExternal(externals, declaration, specifier);
    }
  }

  const taken = new Set<string>();
  for (const entryImport of externals.values()) {
    if (entryImport.defaultName) taken.add(entryImport.defaultName);
    if (entryImport.namespace) taken.add(entryImport.namespace);
    for (const { local } of entryImport.named.values()) taken.add(local);
  }
  const entryModule = modules.get(entry) as ScriptModule;
  for (const name of entryModule.names) taken.add(name);

  /** Each module's top-level names as they appear in the one file. */
  const finals = new Map<string, Map<string, string>>();
  const claim = (module: Module, name: string) => {
    let final = name;
    if (taken.has(name)) {
      const prefix = baseName(module.file).replace(/^./, letter => letter.toLowerCase());
      const named = `${prefix}${name.replace(/^./, letter => letter.toUpperCase())}`;
      final = named;
      for (let n = 2; taken.has(final); n++) final = `${named}${n}`;
    }
    taken.add(final);
    return final;
  };
  finals.set(entry, new Map(entryModule.names.map(name => [name, name])));
  const styleBinding = new Map<string, string>();
  for (const module of ordered) {
    if (module.file === entry) continue;
    if (module.kind === "script") {
      finals.set(module.file, new Map(module.names.map(name => [name, claim(module, name)])));
    }
  }
  // The entry's own class map keeps its name; one a dependency brings is renamed if it clashes.
  for (const module of [entryModule, ...scripts.filter(script => script !== entryModule)]) {
    for (const declaration of module.imports) {
      const resolved = resolve(module.file, specifierOf(declaration)!, liveDir);
      const name = declaration.importClause?.name?.text;
      if (resolved?.endsWith(".css") && name && !styleBinding.has(resolved)) styleBinding.set(resolved, claim(modules.get(resolved)!, name));
    }
  }

  const bodies: string[] = [];
  for (const module of scripts) {
    const text = module.source.getFullText();
    const renames = new Map<string, string>();
    for (const [name, final] of finals.get(module.file)!) if (name !== final) renames.set(name, final);
    const edits: Edit[] = [];
    for (const declaration of module.imports) {
      edits.push({ ...statementRange(declaration, text), text: "" });
      const resolved = resolve(module.file, specifierOf(declaration)!, liveDir);
      if (!resolved || workers.has(resolved)) continue;
      const clause = declaration.importClause;
      if (resolved.endsWith(".css")) {
        if (clause?.name && clause.name.text !== styleBinding.get(resolved)) renames.set(clause.name.text, styleBinding.get(resolved)!);
        continue;
      }
      const bindings = clause?.namedBindings;
      if (clause?.name || (bindings && !ts.isNamedImports(bindings))) {
        throw new Error(`${module.file}: only named imports of ${specifierOf(declaration)} can be inlined`);
      }
      for (const element of bindings?.elements ?? []) {
        const imported = (element.propertyName ?? element.name).text;
        const final = finals.get(resolved)?.get(imported);
        if (!final) throw new Error(`${module.file}: ${specifierOf(declaration)} declares no ${imported}`);
        if (final !== element.name.text) renames.set(element.name.text, final);
      }
    }
    for (const statement of module.source.statements) {
      if (ts.isExportDeclaration(statement)) {
        if (module.file !== entry) {
          edits.push({ ...statementRange(statement, text), text: "" });
          continue;
        }
        const specifier = specifierOf(statement);
        const from = specifier ? resolve(module.file, specifier, liveDir) : module.file;
        const clause = statement.exportClause;
        if (!from || !clause || !ts.isNamedExports(clause)) continue;
        const names = clause.elements.map(element => {
          const local = (element.propertyName ?? element.name).text;
          const final = from === module.file ? (renames.get(local) ?? local) : finals.get(from)?.get(local);
          if (!final) throw new Error(`${module.file}: cannot re-export ${local}`);
          return final === element.name.text ? final : `${final} as ${element.name.text}`;
        });
        const keyword = statement.isTypeOnly ? "export type" : "export";
        edits.push({ start: statement.getStart(), end: statement.end, text: `${keyword} { ${names.join(", ")} };` });
        continue;
      }
      if (module.file === entry) continue;
      const exported = ts.canHaveModifiers(statement) ? ts.getModifiers(statement)?.find(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) : undefined;
      if (exported) {
        let end = exported.end;
        while (text[end] === " ") end++;
        edits.push({ start: exported.getStart(), end, text: "" });
      }
    }
    for (const [from, to] of renames) {
      if (from !== to && new RegExp(`(?<![\\w$])${to.replace(/\$/g, "\\$")}(?![\\w$])`).test(text)) {
        throw new Error(`${module.file}: renaming ${from} to ${to} would clash with a name already there`);
      }
    }
    edits.push(...renameEdits(module.source, renames));
    bodies.push(applyEdits(text, edits).trim());
  }

  const styles = ordered.filter((module): module is StyleModule => module.kind === "style");
  const stylesheet: string[] = [];
  const maps: string[] = [];
  for (const style of styles) {
    const binding = styleBinding.get(style.file);
    if (!binding) continue;
    const { css, classes } = scopeCss(style.css, kebab(baseName(style.file)));
    stylesheet.push(css.trim());
    maps.push(`const ${binding} = {\n${[...classes].map(([name, scoped]) => `  ${propertyKey(name)}: "${scoped}",`).join("\n")}\n};`);
  }
  if (stylesheet.length) {
    const css = claim(entryModule, "CSS");
    const id = `${kebab(baseName(entry))}-styles`;
    bodies.push(
      [
        ...maps,
        `const ${css} = ${templateLiteral(`\n${stylesheet.join("\n\n")}\n`)};`,
        `if (typeof document !== "undefined" && !document.getElementById("${id}")) {\n  document.head.append(Object.assign(document.createElement("style"), { id: "${id}", textContent: ${css} }));\n}`,
      ].join("\n\n"),
    );
  }

  const header = [...[...externals].map(([specifier, entryImport]) => renderExternal(specifier, entryImport)), ...new Set(kept)];
  const code = `${header.length ? `${header.join("\n")}\n\n` : ""}${bodies.filter(Boolean).join("\n\n")}\n`;
  return { name: outName, code: dropUnused(code, outName) };
}

/**
 * A Live component as one file to copy: `<Name>.tsx` with its helpers, its
 * styles, and any other Live component it uses inlined. A Web Worker it starts
 * is a second file, since a browser runs a worker from its own script.
 */
export async function oneFileSources(folder: string, liveDir: string): Promise<SourceFile[]> {
  const entry = path.join(folder, `${path.basename(folder)}.tsx`);
  if (!existsSync(entry)) return [];
  const workers = new Set<string>();
  const main = await bundle(entry, liveDir, workers, path.basename(entry));
  const separate = await Promise.all([...workers].map(worker => bundle(worker, liveDir, new Set(workers), path.basename(worker))));
  return [main, ...separate];
}
