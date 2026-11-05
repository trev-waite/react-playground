export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
export type Rect = Point & Size;
export type Axis = "x" | "y";

/** Something placed on the sheet, where it sits now. */
export type SheetBox = {
  id: string;
  /** Items in one group are related: they sit at the group's gutter, closer than unrelated items. */
  group?: string;
  rect: Rect;
};

export const ZERO: Point = Object.freeze({ x: 0, y: 0 });

export const other = (axis: Axis): Axis => (axis === "x" ? "y" : "x");
export const start = (rect: Rect, axis: Axis) => rect[axis];
export const length = (rect: Rect, axis: Axis) => (axis === "x" ? rect.width : rect.height);
export const end = (rect: Rect, axis: Axis) => start(rect, axis) + length(rect, axis);
export const center = (rect: Rect, axis: Axis) => start(rect, axis) + length(rect, axis) / 2;

/** How far two rects share a span on one axis; negative when they are apart. */
export function overlap(a: Rect, b: Rect, axis: Axis): number {
  return Math.min(end(a, axis), end(b, axis)) - Math.max(start(a, axis), start(b, axis));
}

export const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
export const subtract = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
export const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
export const sameRect = (a: Rect, b: Rect) =>
  samePoint(a, b) && a.width === b.width && a.height === b.height;

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
