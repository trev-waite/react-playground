import { describe, expect, test } from "bun:test";
import path from "node:path";
import { codePath } from "../src/lib/liveRoutes.ts";
import type { SourceFile } from "../src/lib/types.ts";
import { codeFiles, readCodeCards } from "./liveSourcePlugin.ts";

const live = path.join(import.meta.dir, "../src/live");

describe("codeFiles", () => {
  test("publishes every card's files for the code sheet and as Markdown, at the paths the app asks for", async () => {
    const cards = await readCodeCards(live);
    const files = codeFiles(cards, "https://studio.example.com");
    for (const card of cards) {
      const sheet = JSON.parse(files.get(codePath(card.slug, "json"))!) as SourceFile[];
      expect(sheet.map(file => file.name)).toEqual(card.members.flatMap(member => member.files.map(file => file.name)));
      expect(sheet.length).toBeGreaterThan(0);
      expect(files.get(codePath(card.slug, "md"))).toStartWith(`# ${card.title}\n`);
    }
    expect(files.size).toBe(cards.length * 2);
  });
});
