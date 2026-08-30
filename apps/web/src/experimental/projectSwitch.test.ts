import { describe, expect, test } from "bun:test";
import type { IdeaSummary } from "@react-playground/api";
import {
  formatUpdatedAt,
  ideaIdFromPath,
  initialIdeaId,
  filterIdeas,
} from "./projectSwitch";

describe("ideaIdFromPath", () => {
  test("reads a saved project slug from the Experimental URL", () => {
    const id = "18d09969-9048-48b7-a3de-65bfb64e02b0";
    expect(ideaIdFromPath(`/experimental/${id}`)).toBe(id);
    expect(ideaIdFromPath(`/experimental/${id}/`)).toBe(id);
    expect(ideaIdFromPath("/experimental")).toBeNull();
    expect(ideaIdFromPath("/experimental/short")).toBeNull();
    expect(ideaIdFromPath("/buttons/PrimaryButton")).toBeNull();
  });
});

describe("initialIdeaId", () => {
  const ideas: IdeaSummary[] = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      revision: 2,
      name: "Most recent",
      componentName: "MostRecent",
      updatedAt: "2026-08-29T18:00:00.000Z",
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      revision: 1,
      name: "Older",
      componentName: "Older",
      updatedAt: "2026-08-28T18:00:00.000Z",
    },
  ];

  test("prefers the idea named in the URL", () => {
    expect(initialIdeaId(`/experimental/${ideas[1]!.id}`, ideas)).toBe(ideas[1]!.id);
  });

  test("opens the most recently listed idea by default", () => {
    expect(initialIdeaId("/experimental", ideas)).toBe(ideas[0]!.id);
    expect(initialIdeaId("/experimental", [])).toBeNull();
  });
});

describe("formatUpdatedAt", () => {
  const now = Date.parse("2026-08-26T21:00:00.000Z");

  test("uses relative labels for recent saves", () => {
    expect(formatUpdatedAt("2026-08-26T20:59:40.000Z", now)).toBe("just now");
    expect(formatUpdatedAt("2026-08-26T20:52:00.000Z", now)).toBe("8m ago");
    expect(formatUpdatedAt("2026-08-26T18:00:00.000Z", now)).toBe("3h ago");
    expect(formatUpdatedAt("2026-08-24T21:00:00.000Z", now)).toBe("2d ago");
  });

  test("returns empty for invalid timestamps", () => {
    expect(formatUpdatedAt("not-a-date", now)).toBe("");
  });
});

describe("filterIdeas", () => {
  const ideas: IdeaSummary[] = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      revision: 1,
      name: "Quiet Button",
      componentName: "QuietButton",
      updatedAt: "2026-08-26T20:00:00.000Z",
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      revision: 1,
      name: "Morph Blob",
      componentName: "MorphBlob",
      updatedAt: "2026-08-26T19:00:00.000Z",
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      revision: 1,
      name: "Loose Study",
      componentName: "LooseStudy",
      updatedAt: "2026-08-26T18:00:00.000Z",
    },
  ];

  test("sorts newest first", () => {
    expect(filterIdeas(ideas, "").map(idea => idea.name)).toEqual([
      "Quiet Button",
      "Morph Blob",
      "Loose Study",
    ]);
  });

  test("filters by idea name or component name", () => {
    expect(filterIdeas(ideas, "morph")).toEqual([ideas[1]!]);
    expect(filterIdeas(ideas, "button")).toEqual([ideas[0]!]);
    expect(filterIdeas(ideas, "looseStudy")).toEqual([ideas[2]!]);
  });
});
