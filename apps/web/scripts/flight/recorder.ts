export type Frame = {
  at: number;
  flying: boolean;
  /** How far the card's box moved since the frame before, in pixels. */
  moved: number;
  layout: [width: number, height: number];
  /** The preview's content, as shares of the card's width and height. */
  sizes: number[];
  detail?: number[];
};

type PreviewDetail = { stage: string; targets: string[] };

/** `shift` leaves out the flying card's own, which depends on how fast the runner draws; `shiftInAll` does not. */
export type Flight = { frames: Frame[]; shift: number; shiftInAll: number };
export type FlightRecorder = { record: (title: string, detail?: PreviewDetail) => void; stop: () => Flight };

/**
 * Runs in the page, handed over as source, so it stands alone. Each recording
 * owns its sampler: one left waiting on a frame would add to the next.
 */
export function installFlightRecorder() {
  type Shift = PerformanceEntry & { value: number; hadRecentInput: boolean; sources: { node: Node | null }[] };
  const shifts: { at: number; value: number; cards: (Element | null)[] }[] = [];
  new PerformanceObserver(list => {
    for (const entry of list.getEntries() as Shift[]) {
      if (entry.hadRecentInput) continue;
      const cards = entry.sources.map(({ node }) => (node instanceof Element ? node : (node?.parentElement ?? null))?.closest("article[data-deck-card]") ?? null);
      shifts.push({ at: entry.startTime, value: entry.value, cards });
    }
  }).observe({ type: "layout-shift", buffered: true });

  let current: { since: number; card: Element; frames: Frame[]; end: () => void } | null = null;

  const record = (title: string, detail?: PreviewDetail) => {
    current?.end();
    const card = Array.from(document.querySelectorAll("article[data-deck-card]")).find(each => each.getAttribute("aria-label") === title);
    const fit = card?.querySelector<HTMLElement>("[data-deck-fit]");
    const scroller = document.querySelector("[data-layout]");
    if (!card || !fit || !scroller) throw new Error(`No card called ${title} to record.`);
    const watched = Array.from(fit.querySelectorAll("button, input, canvas, svg, a, [role]")).slice(0, 8);
    const stage = detail && fit.querySelector(detail.stage);
    const targets = detail?.targets.map(selector => stage && stage.querySelector(selector));
    if (detail && (!stage || targets?.some(target => !target))) throw new Error(`Preview details for ${title} are missing.`);
    const frames: Frame[] = [];
    let last = card.getBoundingClientRect();
    let active = true;
    let request = 0;
    // A message posted from a frame is handled once that frame has painted, so each sample is what the reader saw.
    const painted = new MessageChannel();
    const nextFrame = () => {
      request = requestAnimationFrame(() => painted.port2.postMessage(null));
    };
    painted.port1.onmessage = () => {
      if (!active) return;
      const box = card.getBoundingClientRect();
      const preview = stage && stage.getBoundingClientRect();
      frames.push({
        at: performance.now(),
        flying: scroller.hasAttribute("data-flying"),
        moved: Math.max(Math.abs(box.x - last.x), Math.abs(box.y - last.y), Math.abs(box.width - last.width), Math.abs(box.height - last.height)),
        layout: [parseFloat(fit.style.width), parseFloat(fit.style.height)],
        sizes: watched.flatMap(element => {
          const { width, height } = element.getBoundingClientRect();
          return [width / box.width, height / box.height];
        }),
        detail: preview ? targets?.flatMap(target => {
          const { x, y, width, height } = target!.getBoundingClientRect();
          return [x - preview.x, y - preview.y, width, height];
        }) : undefined,
      });
      last = box;
      nextFrame();
    };
    nextFrame();
    current = {
      since: performance.now(),
      card,
      frames,
      end: () => {
        active = false;
        cancelAnimationFrame(request);
        painted.port1.close();
        painted.port2.close();
      },
    };
  };

  const stop = (): Flight => {
    const recording = current;
    if (!recording) throw new Error("No flight is being recorded.");
    current = null;
    recording.end();
    // By when it happened, not when it was reported: a shift from before this flight can arrive during it.
    const during = shifts.filter(each => each.at >= recording.since);
    const total = (scored: typeof shifts) => scored.reduce((sum, each) => sum + each.value, 0);
    return {
      frames: recording.frames,
      shift: total(during.filter(each => each.cards.some(card => card !== recording.card))),
      shiftInAll: total(during),
    };
  };

  Object.assign(window, { flightRecorder: { record, stop } satisfies FlightRecorder });
}
