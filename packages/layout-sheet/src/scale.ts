/** Snaps a gap to the spacing scale: 2 or 4 when tiny, otherwise the nearest multiple of 8. */
export function snapSpacing(value: number): number {
  if (value < 1) return 0;
  if (value < 3) return 2;
  if (value < 6) return 4;
  return Math.max(8, Math.round(value / 8) * 8);
}

/** Line height in pixels, on a 4px baseline grid and never tighter than the font size. */
export function snapLineHeight(fontSize: number, lineHeight: number): number {
  return Math.max(Math.ceil(fontSize / 4) * 4, Math.round((fontSize * lineHeight) / 4) * 4);
}

/** How far a gap may sit from the typical one and still count as meaning the same thing. */
export function gapTolerance(typical: number): number {
  return Math.max(4, typical * 0.5);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length / 2;
  return Number.isInteger(middle) ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[Math.floor(middle)]!;
}

/**
 * The average of the gaps the user meant. Values far from the median are strays
 * (an item dragged aside, an overlap) and would pull the average off.
 */
export function typicalGap(values: number[]): number {
  if (values.length === 0) return 0;
  const middle = median(values);
  const meant = values.filter(value => Math.abs(value - middle) <= gapTolerance(middle));
  // Gaps split evenly between two far-apart sizes leave nothing near the median.
  if (meant.length === 0) return middle;
  return meant.reduce((sum, value) => sum + value, 0) / meant.length;
}
