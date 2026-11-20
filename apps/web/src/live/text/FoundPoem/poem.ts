export type PoemWord = { index: number; text: string };

/** The kept words in the order the passage has them. */
export function keptPoem(words: readonly string[], kept: ReadonlySet<number>): PoemWord[] {
  return [...kept].filter(index => index >= 0 && index < words.length).toSorted((a, b) => a - b).map(index => ({ index, text: words[index]! }));
}

export function toggle(kept: ReadonlySet<number>, index: number): ReadonlySet<number> {
  const next = new Set(kept);
  if (!next.delete(index)) next.add(index);
  return next;
}

/** Arrow keys walk the passage a word at a time; Home and End jump to its ends. Other keys are not ours. */
export function moveFocus(key: string, active: number, count: number): number | null {
  const moves: Record<string, number> = {
    ArrowRight: active + 1,
    ArrowDown: active + 1,
    ArrowLeft: active - 1,
    ArrowUp: active - 1,
    Home: 0,
    End: count - 1,
  };
  const next = moves[key];
  return next === undefined ? null : Math.min(count - 1, Math.max(0, next));
}
