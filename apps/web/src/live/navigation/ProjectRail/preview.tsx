import { useState } from "react";
import { ProjectRail, type ProjectRailItem } from "./ProjectRail";
import styles from "./ProjectRailPreview.module.css";
import type { CardMeta } from "@/lib/types";

export const meta: CardMeta = {
  title: "Project Rail",
  description: "Skim the dashes to switch projects; the chosen one becomes a pill that opens into details.",
  size: "wide",
  surface: {
    light: { swatch: "paper", content: ["#000000", "#666666"] },
    dark: { swatch: "mist", content: ["#000000", "#666666"] },
  },
  reset: "reset",
};

/** In OKLCH so the card's color change blends through Oklab, not a muddy sRGB midpoint. */
const PROJECTS: (ProjectRailItem & { tint: string })[] = [
  {
    id: "agent-shell",
    title: "Agent Shell",
    tint: "oklch(0.783 0.168 66.2)",
    summary: "A terminal that hands long tasks to coding agents and keeps their threads tidy.",
    links: [{ label: "Source", href: "https://github.com" }],
  },
  {
    id: "tide-charts",
    title: "Tide Charts",
    tint: "oklch(0.48 0.222 266.3)",
    summary: "Hourly tides for the beaches you saved, drawn as one calm curve.",
    links: [{ label: "Visit", href: "https://example.com" }],
  },
  {
    id: "paper-birds",
    title: "Paper Birds",
    tint: "oklch(0.637 0.194 31.6)",
    summary: "Origami cranes folded live in WebGL, one crease at a time.",
  },
  {
    id: "field-notes",
    title: "Field Notes",
    tint: "oklch(0.651 0.132 156.2)",
    summary: "A pocket notebook that syncs plain-text notes across devices.",
    links: [{ label: "Source", href: "https://github.com" }],
  },
  {
    id: "night-market",
    title: "Night Market",
    tint: "oklch(0.542 0.114 301)",
    summary: "A map of late-night food stalls, ranked by the queue.",
  },
];

export default function ProjectRailPreview() {
  const [activeId, setActiveId] = useState(PROJECTS[0]!.id);
  const active = PROJECTS.find(project => project.id === activeId) ?? PROJECTS[0]!;

  return (
    <div className={styles.stage}>
      <ProjectRail items={PROJECTS} onChange={setActiveId} />
      <div className={styles.shot} style={{ background: active.tint }} aria-hidden="true">
        <span key={active.id}>{active.title}</span>
      </div>
    </div>
  );
}
