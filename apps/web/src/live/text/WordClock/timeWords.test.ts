import { describe, expect, test } from "bun:test";
import { changeWords, dayPart, splitWords, timeSentence, type Word } from "./timeWords";

describe("Word Clock sentences", () => {
  test.each([
    [0, 0, "It is midnight."],
    [12, 0, "It is noon."],
    [16, 0, "It is four o’clock."],
    [16, 1, "It is one minute past four."],
    [16, 10, "It is ten past four."],
    [16, 15, "It is a quarter past four."],
    [16, 22, "It is twenty-two minutes past four."],
    [16, 30, "It is half past four."],
    [16, 35, "It is twenty-five to five."],
    [16, 45, "It is a quarter to five."],
    [16, 59, "It is one minute to five."],
    [11, 50, "It is ten to noon."],
    [23, 40, "It is twenty to midnight."],
    [0, 5, "It is five past midnight."],
  ])("%i:%i reads “%s”", (hour, minute, sentence) => {
    expect(timeSentence(hour, minute)).toBe(sentence);
  });

  test("every minute of the day reads as a sentence, with no gaps or doubled spaces", () => {
    for (let hour = 0; hour < 24; hour++) {
      for (let minute = 0; minute < 60; minute++) {
        expect(timeSentence(hour, minute)).toMatch(/^It is [a-z’-]+( [a-z’-]+)*\.$/);
      }
    }
  });

  test("the part of the day follows the hour the sentence names", () => {
    expect(dayPart(11, 45)).toBe("in the afternoon");
    expect(dayPart(9, 0)).toBe("in the morning");
    expect(dayPart(19, 20)).toBe("in the evening");
    expect(dayPart(2, 0)).toBe("at night");
    expect(dayPart(12, 0)).toBe("");
  });
});

describe("Word Clock word changes", () => {
  const run = (texts: string[]): Word[] => texts.map((text, id) => ({ id, text }));

  test("only the words that differ change; the rest keep their ids", () => {
    const before = run(splitWords("It is ten past four."));
    const { words, removed, nextId } = changeWords(before, splitWords("It is eleven minutes past four."), 10);
    expect(words.map(word => word.text)).toEqual(["It", "is", "eleven", "minutes", "past", "four."]);
    expect(words.map(word => word.id)).toEqual([0, 1, 10, 11, 3, 4]);
    expect(removed.map(word => word.text)).toEqual(["ten"]);
    expect(nextId).toBe(12);
  });

  test("an unchanged sentence moves nothing", () => {
    const before = run(splitWords("It is noon."));
    const change = changeWords(before, splitWords("It is noon."), 5);
    expect(change.words).toEqual(before);
    expect(change.removed).toEqual([]);
  });

  test("winding through an hour keeps every sentence's words in order", () => {
    let words: Word[] = [];
    let nextId = 0;
    for (let minute = 0; minute < 60; minute++) {
      const texts = splitWords(timeSentence(8, minute));
      const change = changeWords(words, texts, nextId);
      expect(change.words.map(word => word.text)).toEqual(texts);
      expect(new Set(change.words.map(word => word.id)).size).toBe(texts.length);
      ({ words, nextId } = change);
    }
  });
});
