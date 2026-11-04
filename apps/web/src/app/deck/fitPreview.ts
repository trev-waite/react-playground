/** Previews lay out in at least this square, then scale down to fit a small tile. */
export const PREVIEW_MIN_SIZE = 320;

/** Scale for a preview area before any overflow correction. Never enlarges. */
export function previewScale(width: number, height: number): number {
  return Math.min(1, Math.max(width, 1) / PREVIEW_MIN_SIZE, Math.max(height, 1) / PREVIEW_MIN_SIZE);
}

type Fit = { area: HTMLElement; content: HTMLElement; width: number; height: number; scale: number };

const fits = new Map<Element, Fit>();
let observer: ResizeObserver | null = null;

function place(fit: Fit) {
  fit.content.style.width = `${fit.width / fit.scale}px`;
  fit.content.style.height = `${fit.height / fit.scale}px`;
  fit.content.style.transform = fit.scale < 1 ? `scale(${fit.scale})` : "";
}

/**
 * Fits every changed preview in three passes (write sizes, read overflow once,
 * correct), so opening the grid costs one forced layout, not one per card.
 */
function refit(batch: Fit[]) {
  for (const fit of batch) {
    fit.scale = previewScale(fit.width, fit.height);
    place(fit);
  }
  const spills = batch.map(fit => {
    const overflow = fit.content.firstElementChild;
    if (!overflow) return 1;
    return Math.max(
      overflow.scrollWidth / fit.content.clientWidth,
      overflow.scrollHeight / fit.content.clientHeight,
    );
  });
  batch.forEach((fit, index) => {
    const spill = spills[index]!;
    if (spill <= 1.01) return;
    fit.scale /= spill;
    place(fit);
  });
}

function sharedObserver(): ResizeObserver {
  observer ??= new ResizeObserver(entries => {
    const batch: Fit[] = [];
    for (const entry of entries) {
      const fit = fits.get(entry.target);
      if (!fit) continue;
      fit.width = Math.max(entry.contentRect.width, 1);
      fit.height = Math.max(entry.contentRect.height, 1);
      batch.push(fit);
    }
    refit(batch);
  });
  return observer;
}

/**
 * Keeps `content` laid out at a readable size and scaled into `area`. Sizes come
 * from layout boxes, never transformed rects, because cards zoom in flight.
 */
export function observeFit(area: HTMLElement, content: HTMLElement): () => void {
  const fit: Fit = {
    area,
    content,
    width: Math.max(area.clientWidth, 1),
    height: Math.max(area.clientHeight, 1),
    scale: 1,
  };
  fits.set(area, fit);
  refit([fit]);
  sharedObserver().observe(area);
  return () => {
    fits.delete(area);
    observer?.unobserve(area);
  };
}
