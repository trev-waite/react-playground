import { createCssVariablesTheme, createHighlighterCore, type HighlighterCore, type ThemedToken } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

/** Token colors are CSS variables (`--code-token-*` in CodeSheet.module.css), so one pass serves both site themes. */
const THEME = createCssVariablesTheme({ name: "studio", variablePrefix: "--code-", variableDefaults: {} });

export type CodeLanguage = "tsx" | "css";

let highlighter: Promise<HighlighterCore> | null = null;

export function loadHighlighter(): Promise<HighlighterCore> {
  highlighter ??= createHighlighterCore({
    themes: [THEME],
    langs: [import("shiki/langs/tsx.mjs"), import("shiki/langs/css.mjs")],
    engine: createJavaScriptRegexEngine(),
  }).catch(error => {
    highlighter = null;
    throw error;
  });
  return highlighter;
}

export function languageOf(fileName: string): CodeLanguage {
  return fileName.endsWith(".css") ? "css" : "tsx";
}

/** The file's lines as colored tokens. The grammar loads on the first call. */
export async function highlight(code: string, language: CodeLanguage): Promise<ThemedToken[][]> {
  const core = await loadHighlighter();
  return core.codeToTokensBase(code, { lang: language, theme: THEME.name! });
}
