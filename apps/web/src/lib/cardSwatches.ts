import type { CardTheme, HexColor, SiteTheme } from "./types";

export type CardSwatch = {
  background: HexColor;
  theme: CardTheme;
};

export type CardSwatchName = "paper" | "night" | "orange" | "blue" | "green";

/**
 * The only backgrounds a card may use, so the deck reads as one set: white and
 * black for components that bring their own color or need a stark ground, and
 * orange, blue, and green for the rest. White and black stay the same on both
 * sites; the three tones turn to mid-tones on the dark one, which hold both
 * white and near-black components.
 */
export const CARD_SWATCHES = {
  light: {
    paper: { background: "#ffffff", theme: "light" },
    night: { background: "#000000", theme: "dark" },
    orange: { background: "#d97400", theme: "light" },
    blue: { background: "#2448d8", theme: "dark" },
    green: { background: "#3a9a6a", theme: "light" },
  },
  dark: {
    paper: { background: "#ffffff", theme: "light" },
    night: { background: "#000000", theme: "dark" },
    orange: { background: "#a85d0c", theme: "light" },
    blue: { background: "#4f6bc8", theme: "light" },
    green: { background: "#3a7862", theme: "light" },
  },
} as const satisfies Record<SiteTheme, Record<CardSwatchName, CardSwatch>>;

export function cardSwatch(theme: SiteTheme, name: string): CardSwatch | undefined {
  const swatches: Record<string, CardSwatch> = CARD_SWATCHES[theme];
  return Object.hasOwn(swatches, name) ? swatches[name] : undefined;
}
