/** One painted frame of a card's flight. */
export type Frame = {
  at: number;
  flying: boolean;
  /** How far the card's box moved since the frame before, in pixels. */
  moved: number;
  /** The size its preview is laid out at. */
  layout: [width: number, height: number];
  /** The preview's content, as shares of the card's width and height. */
  sizes: number[];
};

/**
 * A flight's frames, and the layout shift the browser scored during it: `shift` for cards other than the one flying,
 * which a flight is held to, and `shiftInAll` with the flying card's own, which is what a visitor's page is scored.
 */
export type Flight = { frames: Frame[]; shift: number; shiftInAll: number };
export type FlightRecorder = { record: (title: string) => void; stop: () => Flight };

/**
 * Runs in the page (it is handed over as source, so it stands alone): samples
 * a card's flight a frame at a time and totals the layout shifts the browser
 * scores for the cards around it. The flying card's own motion is left out:
 * it moves by layout, which the browser excuses for half a second after the
 * click and scores after, by how far each frame carries it, so a slow runner
 * scores more for the same flight. Each recording owns its frames and its
 * sampler, and starting or stopping one ends the last for good: a sampler
 * left waiting on a frame would otherwise wake inside the next recording and
 * add its own.
 */
export function installFlightRecorder() {
  type Shift = PerformanceEntry & { value: number; hadRecentInput: boolean; sources: { node: Node | null }[] };
  const shifts: { at: number; value: number; cards: (Element | null)[] }[] = [];
  new PerformanceObserver(list => {
    for (const entry of list.getEntries() as Shift[]) {
      if (entry.hadRecentInput) continue;
      const cards = entry.sources.map(({ node }) => (node instanceof Element ? node : (node?.parentElement ?? null))?.closest("article") ?? null);
      shifts.push({ at: entry.startTime, value: entry.value, cards });
    }
  }).observe({ type: "layout-shift", buffered: true });

  let current: { since: number; card: Element; frames: Frame[]; end: () => void } | null = null;

  const record = (title: string) => {
    current?.end();
    const card = Array.from(document.querySelectorAll("article")).find(each => each.getAttribute("aria-label") === title);
    const fit = card?.querySelector<HTMLElement>('[class*="_fit_"]');
    const scroller = document.querySelector("[data-layout]");
    if (!card || !fit || !scroller) throw new Error(`No card called ${title} to record.`);
    const watched = Array.from(fit.querySelectorAll("button, input, canvas, svg, a, [role]")).slice(0, 8);
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
      frames.push({
        at: performance.now(),
        flying: scroller.hasAttribute("data-flying"),
        moved: Math.max(Math.abs(box.x - last.x), Math.abs(box.y - last.y), Math.abs(box.width - last.width), Math.abs(box.height - last.height)),
        layout: [parseFloat(fit.style.width), parseFloat(fit.style.height)],
        sizes: watched.flatMap(element => {
          const { width, height } = element.getBoundingClientRect();
          return [width / box.width, height / box.height];
        }),
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
