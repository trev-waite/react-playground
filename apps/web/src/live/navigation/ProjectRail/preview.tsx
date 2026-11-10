import { useState } from "react";
import { ProjectRail, type ProjectRailItem } from "./ProjectRail";
import styles from "./ProjectRailPreview.module.css";
import type { CardMeta } from "@/lib/types";

export const meta: CardMeta = {
  title: "Project Rail",
  description: "Skim the dashes to switch projects; the chosen one becomes a pill that opens into details.",
  size: "wide",
  reset: "reset",
};

const PROJECTS: (ProjectRailItem & { tint: string })[] = [
  {
    id: "agent-shell",
    title: "Agent Shell",
    tint: "#ff9f1c",
    summary: "A terminal that hands long tasks to coding agents and keeps their threads tidy.",
    links: [{ label: "Source", href: "https://github.com" }],
  },
  {
    id: "tide-charts",
    title: "Tide Charts",
    tint: "#2448d8",
    summary: "Hourly tides for the beaches you saved, drawn as one calm curve.",
    links: [{ label: "Visit", href: "https://example.com" }],
  },
  {
    id: "paper-birds",
    title: "Paper Birds",
    tint: "#e94f37",
    summary: "Origami cranes folded live in WebGL, one crease at a time.",
  },
  {
    id: "field-notes",
    title: "Field Notes",
    tint: "#3aa76d",
    summary: "A pocket notebook that syncs plain-text notes across devices.",
    links: [{ label: "Source", href: "https://github.com" }],
  },
  {
    id: "night-market",
    title: "Night Market",
    tint: "#7b5ea7",
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
