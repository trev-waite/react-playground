import { describe, expect, test } from "bun:test";
import {
  formatSavedAt,
  ideaNameFromPath,
  initialIdeaComponentName,
  organizeIdeas,
} from "./projectSwitch";

describe("ideaNameFromPath", () => {
  test("reads a saved project slug from the Experimental URL", () => {
    expect(ideaNameFromPath("/experimental/MorphBlob")).toBe("MorphBlob");
    expect(ideaNameFromPath("/experimental/MorphBlob/")).toBe("MorphBlob");
    expect(ideaNameFromPath("/experimental")).toBeNull();
    expect(ideaNameFromPath("/experimental/foo-bar")).toBeNull();
    expect(ideaNameFromPath("/buttons/PrimaryButton")).toBeNull();
  });
});

describe("initialIdeaComponentName", () => {
  const ideas = [
    {
      name: "Most recent",
      componentName: "MostRecent",
      folder: "shapes",
      savedAt: "2026-08-29T18:00:00.000Z",
    },
    {
      name: "Older",
      componentName: "Older",
      folder: "shapes",
      savedAt: "2026-08-28T18:00:00.000Z",
    },
  ];

  test("prefers the idea named in the URL", () => {
    expect(initialIdeaComponentName("/experimental/Older", ideas)).toBe("Older");
  });

  test("opens the most recently listed idea by default", () => {
    expect(initialIdeaComponentName("/experimental", ideas)).toBe("MostRecent");
    expect(initialIdeaComponentName("/experimental", [])).toBeNull();
  });
});

describe("formatSavedAt", () => {
  const now = Date.parse("2026-08-26T21:00:00.000Z");

  test("uses relative labels for recent saves", () => {
    expect(formatSavedAt("2026-08-26T20:59:40.000Z", now)).toBe("just now");
    expect(formatSavedAt("2026-08-26T20:52:00.000Z", now)).toBe("8m ago");
    expect(formatSavedAt("2026-08-26T18:00:00.000Z", now)).toBe("3h ago");
    expect(formatSavedAt("2026-08-24T21:00:00.000Z", now)).toBe("2d ago");
  });

  test("returns empty for invalid timestamps", () => {
    expect(formatSavedAt("not-a-date", now)).toBe("");
  });
});

describe("organizeIdeas", () => {
  const ideas = [
    {
      name: "Quiet Button",
      componentName: "QuietButton",
      folder: "buttons",
      savedAt: "2026-08-26T20:00:00.000Z",
    },
    {
      name: "Morph Blob",
      componentName: "MorphBlob",
      folder: "shapes",
      savedAt: "2026-08-26T19:00:00.000Z",
    },
    {
      name: "Loose Study",
      componentName: "LooseStudy",
      folder: "",
      savedAt: "2026-08-26T18:00:00.000Z",
    },
  ];

  test("groups folders alphabetically and leaves unassigned ideas last", () => {
    expect(organizeIdeas(ideas, "").map(group => group.folder)).toEqual([
      "buttons",
      "shapes",
      "",
    ]);
  });

  test("filters by idea name, component name, or folder", () => {
    expect(organizeIdeas(ideas, "morph")[0]?.ideas).toEqual([ideas[1]]);
    expect(organizeIdeas(ideas, "buttons")[0]?.ideas).toEqual([ideas[0]]);
    expect(organizeIdeas(ideas, "looseStudy")[0]?.ideas).toEqual([ideas[2]]);
  });
});
