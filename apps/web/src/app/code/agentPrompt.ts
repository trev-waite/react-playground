import { codePath, SITE_TITLE } from "../../lib/liveRoutes";

export type PromptCard = {
  slug: string;
  title: string;
  description?: string;
  members: readonly { title: string }[];
};

/**
 * What a reader hands their coding agent to rebuild a card's components in
 * their own project: what it is, and where to download its full source.
 */
export function agentPrompt(card: PromptCard, origin: string): string {
  const names = card.members.length > 1 ? `${card.title} components (${card.members.map(member => member.title).join(", ")})` : `${card.title} component`;
  return [
    `Add the ${names} from ${SITE_TITLE} to this project.`,
    ...(card.description ? ["", `What it is: ${card.description}`] : []),
    "",
    `Source: ${origin}${codePath(card.slug, "md")}`,
    "Download it first: the whole component is one React and TypeScript file, and the page names anything else it needs.",
    "",
    "Rebuild it to fit this codebase: follow its file layout, styling, and conventions, and keep the behavior, motion, and accessibility the same. Check that it works before you finish.",
  ].join("\n");
}
