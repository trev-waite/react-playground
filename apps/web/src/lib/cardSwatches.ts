import type { CardTheme, HexColor, SiteTheme } from "./types";

export type CardSwatch = {
  background: HexColor;
  /** Which ink reads on the background. */
  theme: CardTheme;
};

/**
 * The only backgrounds a card may use, so the deck reads as one set: orange,
 * blue, and green, plus neutrals for components that bring their own color.
 * `night` is the dark site's `paper`: a card just darker than the canvas, as
 * paper is just lighter. The dark site's tones are mid-tones on purpose;
 * darker ones hide the near-black buttons and pills that sit on them.
 */
export const CARD_SWATCHES = {
  light: {
    paper: { background: "#ffffff", theme: "light" },
    orange: { background: "#d97400", theme: "light" },
    blue: { background: "#2448d8", theme: "dark" },
    green: { background: "#3a9a6a", theme: "light" },
  },
  dark: {
    orange: { background: "#a85d0c", theme: "light" },
    blue: { background: "#4f6bc8", theme: "light" },
    green: { background: "#3a7862", theme: "light" },
    night: { background: "#050608", theme: "dark" },
    mist: { background: "#bcc3cf", theme: "light" },
  },
} as const satisfies Record<SiteTheme, Record<string, CardSwatch>>;

export type CardSwatchName<T extends SiteTheme> = keyof (typeof CARD_SWATCHES)[T];

/** The named swatch, or nothing for a name the theme does not have. */
export function cardSwatch(theme: SiteTheme, name: string): CardSwatch | undefined {
  const swatches: Record<string, CardSwatch> = CARD_SWATCHES[theme];
  return Object.hasOwn(swatches, name) ? swatches[name] : undefined;
}
