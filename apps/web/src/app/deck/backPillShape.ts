/** Where the neck leaves each circle, as an angle up from the line between their centers. */
const NECK_ANGLE = (55 * Math.PI) / 180;
/** How far the neck's curves lean along each circle before bending toward the middle, per unit of radius. */
const NECK_PULL = 6 / 22;

/**
 * The back pill's outline: two circles in a row, held together by a neck
 * that dips in at the top and bottom like water between them. As the right
 * circle slides into the left, the dip flattens until they are one circle.
 */
export function backPillPath(width: number, height: number): string {
  const r = height / 2;
  const d = Math.max(0, width - height);
  const t = Math.min(1, d / height);
  const angle = Math.PI / 2 + (NECK_ANGLE - Math.PI / 2) * t;
  const pull = NECK_PULL * r * t;
  const cos = Math.cos(angle) * r;
  const sin = Math.sin(angle) * r;
  const tx = Math.sin(angle) * pull;
  const ty = Math.cos(angle) * pull;
  const left = r;
  const right = r + d;

  const topLeft = [left + cos, r - sin];
  const topRight = [right - cos, r - sin];
  const bottomRight = [right - cos, r + sin];
  const bottomLeft = [left + cos, r + sin];

  const point = ([x, y]: number[]) => `${round(x!)} ${round(y!)}`;
  return [
    `M ${point(topLeft)}`,
    `C ${point([topLeft[0]! + tx, topLeft[1]! + ty])} ${point([topRight[0]! - tx, topRight[1]! + ty])} ${point(topRight)}`,
    `A ${round(r)} ${round(r)} 0 1 1 ${point(bottomRight)}`,
    `C ${point([bottomRight[0]! - tx, bottomRight[1]! - ty])} ${point([bottomLeft[0]! + tx, bottomLeft[1]! - ty])} ${point(bottomLeft)}`,
    `A ${round(r)} ${round(r)} 0 1 1 ${point(topLeft)}`,
    "Z",
  ].join(" ");
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
