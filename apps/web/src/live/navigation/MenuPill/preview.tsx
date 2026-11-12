import { useState } from "react";
import { IconSwap, MenuPill } from "./MenuPill";
import styles from "./MenuPillPreview.module.css";
import type { CardMeta } from "@/lib/types";

export const meta: CardMeta = {
  title: "Menu Pill",
  description: "A quiet island that stretches open into the whole menu on hover or tap.",
  size: "wide",
  surface: {
    light: { swatch: "paper", content: ["#000000"] },
    dark: { swatch: "green", content: ["#000000"] },
  },
  reset: "reset",
};

const SECTIONS = ["Work", "Notes", "Contact"];
const LAYOUTS = ["Studio", "Grid", "List"];

function MoonIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

export default function MenuPillPreview() {
  const [layout, setLayout] = useState(LAYOUTS[0]);
  const [dark, setDark] = useState(false);

  return (
    <MenuPill
      label="site menu"
      groups={[
        [
          { id: "home", label: <span className={styles.logo}>TW.</span>, ariaLabel: "Back to top" },
          ...SECTIONS.map(section => ({ id: section, label: section })),
        ],
        LAYOUTS.map(option => ({
          id: option,
          label: option,
          active: option === layout,
          keepOpen: true,
          onSelect: () => setLayout(option),
        })),
        [
          {
            id: "scheme",
            label: <IconSwap value={dark ? "sun" : "moon"} states={{ moon: <MoonIcon />, sun: <SunIcon /> }} />,
            ariaLabel: dark ? "Switch to light mode" : "Switch to dark mode",
            keepOpen: true,
            onSelect: () => setDark(current => !current),
          },
        ],
      ]}
    />
  );
}
