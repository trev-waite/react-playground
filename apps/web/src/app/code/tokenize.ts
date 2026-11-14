import { createCssVariablesTheme, createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import css from "shiki/langs/css.mjs";
import tsx from "shiki/langs/tsx.mjs";

/** Token colors are CSS variables (`--code-token-*` in CodeSheet.module.css), so one pass serves both site themes. */
const THEME = createCssVariablesTheme({ name: "studio", variablePrefix: "--code-", variableDefaults: {} });

export type CodeLanguage = "tsx" | "css";

/** A run of text in one color; a plain run has none. */
export type Run = { content: string; color?: string };

let highlighter: Promise<HighlighterCore> | null = null;

function load(): Promise<HighlighterCore> {
  highlighter ??= createHighlighterCore({ themes: [THEME], langs: [tsx, css], engine: createJavaScriptRegexEngine() });
  return highlighter;
}

/** The code's lines as colored runs. The first call compiles the grammar's patterns, which takes a long moment. */
export async function tokenize(code: string, language: CodeLanguage): Promise<Run[][]> {
  const core = await load();
  return core
    .codeToTokensBase(code, { lang: language, theme: THEME.name! })
    .map(line => line.map(token => ({ content: token.content, color: token.color })));
}
