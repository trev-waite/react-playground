import { codePath, livePath, SITE_TITLE } from "../../lib/liveRoutes";

export type PromptCard = {
  slug: string;
  title: string;
  description?: string;
  members: readonly { title: string }[];
};

/**
 * What a reader hands their coding agent to bring a card's components into
 * their own project unchanged: where to download the source, an instruction
 * to copy it as is rather than restyle it to the project, and the live page to
 * check the result against.
 */
export function agentPrompt(card: PromptCard, origin: string): string {
  const family = card.members.length > 1;
  const names = family ? `${card.title} components (${card.members.map(member => member.title).join(", ")})` : `${card.title} component`;
  const it = family ? "them" : "it";
  return [
    `Add the ${names} from ${SITE_TITLE} to this project, exactly as ${family ? "they are" : "it is"}.`,
    ...(card.description ? ["", `What it is: ${card.description}`] : []),
    "",
    `Source: ${origin}${codePath(card.slug, "md")}`,
    `Live: ${origin}${livePath(card.slug)}`,
    "",
    `1. Download the source. Each component is one React and TypeScript file, and the page names anything else ${it} needs.`,
    `2. Copy ${it} in as is. Keep the look, behavior, motion, and accessibility identical; don't restyle ${it} to match this project. Change only what ${family ? "they need" : "it needs"} to run here, such as import paths or a missing dependency, and anything I ask for.`,
    `3. Render ${it} and compare with the live version, then fix any difference before you finish.`,
  ].join("\n");
}
