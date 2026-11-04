import { domReader, type LayoutReader } from "./dom";
import {
  add,
  clamp,
  samePoint,
  subtract,
  ZERO,
  type Point,
  type Rect,
  type SheetBox,
  type Size,
} from "./geometry";
import { tidy, type TidyOptions } from "./tidy";

export type SheetItemOptions = {
  /** Related items share a group and its gutter. */
  group?: string;
};

export type PlanInput = { boxes: SheetBox[]; bounds: Size };
/** Where each item's top-left corner goes, by id. Items left out stay put. */
export type SheetPlan = { positions: Record<string, Point> };
/** Turns a hand-made layout into a tidy one. Code by default; an AI planner can be passed in. */
export type SheetPlanner = (input: PlanInput) => SheetPlan | Promise<SheetPlan>;

export type SheetSnapshot = {
  boxes: readonly SheetBox[];
  bounds: Size;
  /** Items are gliding to a planned layout. */
  settling: boolean;
  canUndo: boolean;
};

export type SheetOptions = {
  /** Replaces the default planner. */
  planner?: SheetPlanner;
  /** Tunes the default planner. */
  tidy?: TidyOptions;
  /** Arrow keys move by `step`, or `largeStep` with Shift. */
  step?: number;
  largeStep?: number;
  /** How long items glide to a planned layout, and on what curve. */
  settleMs?: number;
  easing?: string;
  reader?: LayoutReader;
};

/** A spring as a CSS easing: quick out, one small overshoot, then still. */
export const SETTLE_EASING =
  "linear(0, 0.12 3%, 0.46 10%, 0.82 19%, 1.02 28%, 1.07 34%, 1.06 40%, 1.01 52%, 0.995 64%, 1)";
const DEFAULT_SETTLE_MS = 600;
const DRAG_THRESHOLD_PX = 3;
/** Pressing in these edits text rather than dragging. */
const FIELDS = "input, textarea, select, [contenteditable]";
const ARROWS: Record<string, Point> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

type Item = {
  id: string;
  element: HTMLElement;
  group?: string;
  /** Where layout put it, before the sheet moved it. */
  natural: Rect;
  /** Inline styles the sheet takes over, given back when the item leaves. */
  restore: { styles: Record<string, string>; tabIndex: string | null };
};

const ITEM_STYLES = {
  cursor: "grab",
  "touch-action": "none",
  "user-select": "none",
  "-webkit-user-select": "none",
} as const;

function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * A layout sheet over an existing screen. Items stay where their own layout puts them;
 * the sheet only offsets them with CSS `translate`, so any markup works, and dragging
 * writes straight to the DOM without re-rendering anything.
 */
export class Sheet {
  readonly #planner: SheetPlanner;
  readonly #reader: LayoutReader;
  readonly #step: number;
  readonly #largeStep: number;
  readonly #settleMs: number;
  readonly #easing: string;

  #root: HTMLElement | null = null;
  #rootPosition: string | null = null;
  #observer: ResizeObserver | null = null;
  readonly #items = new Map<string, Item>();
  readonly #byElement = new WeakMap<Element, Item>();
  readonly #refs = new Map<string, { options: SheetItemOptions; ref: (element: HTMLElement | null) => void }>();
  /** Kept when an item unmounts, so it comes back where it was left. */
  readonly #offsets = new Map<string, Point>();
  /** Positions on screen before each plan, so undo survives layout changes in between. */
  readonly #history: Map<string, Point>[] = [];
  #bounds: Size = { width: 0, height: 0 };
  #settling = false;
  #settleTimer: ReturnType<typeof setTimeout> | undefined;
  #measureQueued = false;
  /** Ends the drag in progress, if any. */
  #gesture: { item: Item; end: () => void } | null = null;
  readonly #listeners = new Set<() => void>();
  #snapshot: SheetSnapshot | null = null;

  constructor(options: SheetOptions = {}) {
    this.#planner = options.planner ?? (({ boxes }) => tidy(boxes, options.tidy));
    this.#reader = options.reader ?? domReader;
    this.#step = options.step ?? 1;
    this.#largeStep = options.largeStep ?? 8;
    this.#settleMs = options.settleMs ?? DEFAULT_SETTLE_MS;
    this.#easing = options.easing ?? SETTLE_EASING;
  }

  /** Ref callback for the element that holds the screen. */
  readonly root = (element: HTMLElement | null) => {
    if (element) this.attach(element);
    else this.detach();
  };

  attach(root: HTMLElement) {
    if (this.#root === root) return;
    this.detach();
    this.#root = root;
    // Offsets are measured from the root, so it must be their offsetParent.
    if (getComputedStyle(root).position === "static") {
      this.#rootPosition = root.style.position;
      root.style.position = "relative";
    }
    root.addEventListener("pointerdown", this.#onPointerDown);
    root.addEventListener("keydown", this.#onKeyDown);
    this.#observer = new ResizeObserver(() => this.measure());
    this.#observer.observe(root);
    for (const item of this.#items.values()) this.#observer.observe(item.element);
    this.measure();
  }

  detach() {
    const root = this.#root;
    if (!root) return;
    this.#gesture?.end();
    root.removeEventListener("pointerdown", this.#onPointerDown);
    root.removeEventListener("keydown", this.#onKeyDown);
    this.#observer?.disconnect();
    this.#observer = null;
    if (this.#rootPosition !== null) root.style.position = this.#rootPosition;
    this.#rootPosition = null;
    this.#root = null;
  }

  /**
   * A stable ref callback that makes an element draggable: `ref={sheet.item("logo")}`.
   * The same id always returns the same callback, so re-renders do not re-register.
   */
  item(id: string, options: SheetItemOptions = {}): (element: HTMLElement | null) => void {
    const cached = this.#refs.get(id);
    if (cached) {
      cached.options = options;
      const item = this.#items.get(id);
      if (item) item.group = options.group;
      return cached.ref;
    }
    const entry = {
      options,
      ref: (element: HTMLElement | null) => {
        if (element) this.register(element, { id, ...entry.options });
        else this.unregister(id);
      },
    };
    this.#refs.set(id, entry);
    return entry.ref;
  }

  register(element: HTMLElement, { id, group }: SheetItemOptions & { id: string }): () => void {
    const existing = this.#items.get(id);
    if (existing && existing.element !== element) this.unregister(id);
    if (existing?.element === element) {
      existing.group = group;
      return () => this.unregister(id);
    }
    const styles: Record<string, string> = { translate: element.style.translate, transition: element.style.transition };
    for (const [property, value] of Object.entries(ITEM_STYLES)) {
      styles[property] = element.style.getPropertyValue(property);
      element.style.setProperty(property, value);
    }
    const item: Item = {
      id,
      element,
      group,
      natural: { x: 0, y: 0, width: 0, height: 0 },
      restore: { styles, tabIndex: element.getAttribute("tabindex") },
    };
    // Keyboard users move items too.
    if (element.tabIndex < 0) element.tabIndex = 0;
    element.dataset.sheetItem = id;
    this.#items.set(id, item);
    this.#byElement.set(element, item);
    this.#observer?.observe(element);
    this.#apply(item);
    this.#queueMeasure();
    return () => this.unregister(id);
  }

  unregister(id: string) {
    const item = this.#items.get(id);
    if (!item) return;
    if (this.#gesture?.item === item) this.#gesture.end();
    const { element, restore } = item;
    for (const [property, value] of Object.entries(restore.styles)) element.style.setProperty(property, value);
    if (restore.tabIndex === null) element.removeAttribute("tabindex");
    else element.setAttribute("tabindex", restore.tabIndex);
    delete element.dataset.sheetItem;
    this.#observer?.unobserve(element);
    this.#items.delete(id);
    this.#byElement.delete(element);
    this.#emit();
  }

  /** Re-reads where layout put every item. Runs on resize; call it after other layout changes. */
  measure() {
    this.#measureQueued = false;
    const root = this.#root;
    if (!root) return;
    for (const item of this.#items.values()) item.natural = this.#reader.rect(item.element, root);
    this.#bounds = this.#reader.bounds(root);
    this.#emit();
  }

  offset(id: string): Point {
    return this.#offsets.get(id) ?? ZERO;
  }

  /** Where an item's top-left corner sits on the sheet now. */
  position(id: string): Point {
    const item = this.#items.get(id);
    return item ? add(item.natural, this.offset(id)) : this.offset(id);
  }

  boxes(): SheetBox[] {
    return [...this.#items.values()].map(item => ({
      id: item.id,
      ...(item.group != null ? { group: item.group } : null),
      rect: { ...item.natural, ...this.position(item.id) },
    }));
  }

  /** Moves an item's top-left corner to `to`, kept inside the sheet. */
  moveTo(id: string, to: Point) {
    const item = this.#items.get(id);
    if (!item) return;
    const max = {
      x: Math.max(0, this.#bounds.width - item.natural.width),
      y: Math.max(0, this.#bounds.height - item.natural.height),
    };
    this.#stopSettling();
    this.#setOffset(item, subtract({ x: clamp(to.x, 0, max.x), y: clamp(to.y, 0, max.y) }, item.natural));
    this.#emit();
  }

  moveBy(id: string, delta: Point) {
    this.moveTo(id, add(this.position(id), delta));
  }

  /** Every item's offset from where its layout put it, to save or restore a session. */
  offsets(): Record<string, Point> {
    return Object.fromEntries(this.#offsets);
  }

  /** Sets offsets from layout, gliding there when `animate` is set. */
  setOffsets(offsets: Record<string, Point>, { animate = false }: { animate?: boolean } = {}) {
    if (animate) this.#settle();
    else this.#stopSettling();
    for (const [id, offset] of Object.entries(offsets)) {
      const item = this.#items.get(id);
      if (item) this.#setOffset(item, offset);
      else this.#offsets.set(id, offset);
    }
    this.#emit();
  }

  /** Runs the planner and glides every item into place. Undo puts them back. */
  async tidy(planner: SheetPlanner = this.#planner): Promise<{ plan: SheetPlan; moved: boolean }> {
    this.measure();
    const before = this.#positions();
    const plan = await planner({ boxes: this.boxes(), bounds: this.#bounds });
    // A custom planner may return anything; a non-finite position would become invalid CSS.
    const positions = Object.entries(plan.positions).filter(
      ([, to]) => Number.isFinite(to.x) && Number.isFinite(to.y),
    );
    const moved = positions.some(([id, to]) => this.#items.has(id) && !samePoint(to, this.position(id)));
    if (moved) {
      this.#history.push(before);
      this.#settle();
      for (const [id, to] of positions) {
        const item = this.#items.get(id);
        if (item) this.#setOffset(item, subtract(to, item.natural));
      }
    }
    this.#emit();
    return { plan, moved };
  }

  /** Glides items back to where they were before the last plan. */
  undo(): boolean {
    const previous = this.#history.pop();
    if (!previous) return false;
    this.measure();
    this.#settle();
    for (const item of this.#items.values()) {
      const at = previous.get(item.id);
      if (at) this.#setOffset(item, subtract(at, item.natural));
    }
    this.#emit();
    return true;
  }

  /**
   * Runs a change that moves the layout underneath (a new line height, a resized
   * panel) while every item stays where it is on screen. `change` must update the
   * DOM before it returns; in React, wrap the state update in `flushSync`.
   */
  keepInPlace(change: () => void) {
    this.measure();
    const before = this.#positions();
    change();
    this.measure();
    this.#stopSettling();
    for (const item of this.#items.values()) {
      const at = before.get(item.id);
      if (at) this.#setOffset(item, subtract(at, item.natural));
    }
    this.#emit();
  }

  readonly subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): SheetSnapshot =>
    (this.#snapshot ??= {
      boxes: this.boxes(),
      bounds: this.#bounds,
      settling: this.#settling,
      canUndo: this.#history.length > 0,
    });

  dispose() {
    this.detach();
    clearTimeout(this.#settleTimer);
    this.#listeners.clear();
  }

  #positions(): Map<string, Point> {
    return new Map([...this.#items.keys()].map(id => [id, this.position(id)]));
  }

  #setOffset(item: Item, offset: Point) {
    if (samePoint(offset, this.offset(item.id))) return;
    this.#offsets.set(item.id, offset);
    this.#apply(item);
  }

  #apply(item: Item) {
    const offset = this.offset(item.id);
    item.element.style.translate = samePoint(offset, ZERO)
      ? (item.restore.styles.translate ?? "")
      : `${offset.x}px ${offset.y}px`;
  }

  #settle() {
    clearTimeout(this.#settleTimer);
    if (prefersReducedMotion()) {
      this.#stopSettling();
      return;
    }
    this.#settling = true;
    for (const item of this.#items.values()) {
      const own = item.restore.styles.transition;
      item.element.style.transition = `translate ${this.#settleMs}ms ${this.#easing}${own ? `, ${own}` : ""}`;
    }
    this.#settleTimer = setTimeout(() => {
      this.#stopSettling();
      this.#emit();
    }, this.#settleMs);
  }

  #stopSettling() {
    if (!this.#settling) return;
    clearTimeout(this.#settleTimer);
    this.#settling = false;
    for (const item of this.#items.values()) item.element.style.transition = item.restore.styles.transition ?? "";
  }

  #queueMeasure() {
    if (this.#measureQueued) return;
    this.#measureQueued = true;
    queueMicrotask(() => this.measure());
  }

  #emit() {
    this.#snapshot = null;
    for (const listener of this.#listeners) listener();
  }

  #itemAt(target: EventTarget | null): Item | undefined {
    for (let node = target instanceof Element ? target : null; node && node !== this.#root; node = node.parentElement) {
      const item = this.#byElement.get(node);
      if (item) return item;
    }
    return undefined;
  }

  readonly #onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || !event.isPrimary || !this.#root) return;
    const item = this.#itemAt(event.target);
    if (!item || (event.target instanceof Element && event.target.closest(FIELDS))) return;
    this.measure();
    const { element } = item;
    const scale = this.#reader.scale(this.#root) || 1;
    const origin = this.position(item.id);
    const pointer = { x: event.clientX, y: event.clientY };
    const { pointerId } = event;
    const document = element.ownerDocument;
    let dragging = false;

    const move = (next: PointerEvent) => {
      if (next.pointerId !== pointerId) return;
      const delta = { x: next.clientX - pointer.x, y: next.clientY - pointer.y };
      // A press that barely moves is a click. Capture waits until then, because it
      // would retarget the click away from a button inside the item.
      if (!dragging && Math.hypot(delta.x, delta.y) < DRAG_THRESHOLD_PX) return;
      if (!dragging) {
        dragging = true;
        element.setPointerCapture(pointerId);
        element.style.cursor = "grabbing";
      }
      this.moveTo(item.id, { x: origin.x + delta.x / scale, y: origin.y + delta.y / scale });
    };
    const finish = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end);
      element.removeEventListener("lostpointercapture", end);
      if (element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
      element.style.cursor = ITEM_STYLES.cursor;
      if (this.#gesture?.end === finish) this.#gesture = null;
    };
    const end = (last: PointerEvent) => {
      if (last.pointerId === pointerId) finish();
    };
    // A press that is still down when another starts, or when the sheet goes away, ends first.
    this.#gesture?.end();
    this.#gesture = { item, end: finish };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
    element.addEventListener("lostpointercapture", end);
  };

  readonly #onKeyDown = (event: KeyboardEvent) => {
    const direction = ARROWS[event.key];
    const item = event.target instanceof Element ? this.#byElement.get(event.target) : undefined;
    // Alt, Ctrl, and Meta stay free for the screen's own shortcuts.
    if (!direction || !item || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    const step = event.shiftKey ? this.#largeStep : this.#step;
    this.moveBy(item.id, { x: direction.x * step, y: direction.y * step });
  };
}
