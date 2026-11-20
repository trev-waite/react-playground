/** One frame or short timer that ran while the check watched, by the code that scheduled it. */
export type IdleRecord = { kind: "frame" | "timer"; source: string };

export type IdleOffender = { source: string; kind: IdleRecord["kind"]; perSecond: number };

/** More often than this, and work is recurring rather than finishing up. */
export const MAX_PER_SECOND = 1;

/**
 * Whether a page whose cards are all off screen but one still one stayed idle: no source may schedule
 * frames or short timers more than about once a second. One-off work, such as a timer that settles a
 * resize, passes; a loop, however it is written, does not.
 */
export function judgeIdle(records: IdleRecord[], seconds: number): { ok: boolean; offenders: IdleOffender[] } {
  const counts = new Map<string, { source: string; kind: IdleRecord["kind"]; count: number }>();
  for (const record of records) {
    const key = `${record.kind} ${record.source}`;
    const entry = counts.get(key) ?? { source: record.source, kind: record.kind, count: 0 };
    entry.count++;
    counts.set(key, entry);
  }
  const offenders = [...counts.values()]
    .map(({ source, kind, count }) => ({ source, kind, perSecond: count / seconds }))
    .filter(entry => entry.perSecond > MAX_PER_SECOND)
    .sort((a, b) => b.perSecond - a.perSecond);
  return { ok: offenders.length === 0, offenders };
}

/** The card a scheduling stack belongs to: the first built chunk on it, named by the card whose preview loads that chunk. */
export function sourceOf(stack: string, chunkToCard: Map<string, string>): string {
  for (const line of stack.split("\n")) {
    const match = /\/assets\/([\w.-]+\.js):(\d+):(\d+)/.exec(line);
    if (!match) continue;
    const card = chunkToCard.get(match[1]!);
    const at = line.trim().replace(/^at\s+/, "").split(" (")[0];
    return card ? `${card} (${at})` : `${match[1]} (${at})`;
  }
  return "unknown";
}

/** Which card each preview chunk belongs to, read from the entry chunk's lazy preview imports. */
export function previewChunks(entry: string): Map<string, string> {
  const chunks = new Map<string, string>();
  for (const [, slug, chunk] of entry.matchAll(/"\.\.\/live\/([^"]+)\/preview\.tsx":\(\)=>\w+\(\(\)=>import\(`\.\/([\w.-]+\.js)`\)/g)) {
    chunks.set(chunk!, slug!);
  }
  return chunks;
}
