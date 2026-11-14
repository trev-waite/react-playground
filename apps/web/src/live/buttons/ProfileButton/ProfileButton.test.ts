import { describe, expect, test } from "bun:test";
import { ARROW_SIZE, DETAILS_HEIGHT, STACK_MIN_HEIGHT, STRIP_HEIGHT, PULL, SAMPLES, cubicBezier, frameAt, geometry, roomLayout, roomToStage, tracks } from "./portal";

const stage = { width: 900, height: 640 };
const avatar = { x: 450, y: 320 };
const g = geometry(stage, avatar, 18);

describe("Profile Button portal", () => {
  test("the portal opens wide enough to cover every corner of the stage", () => {
    for (const corner of [{ x: 0, y: 0 }, { x: stage.width, y: 0 }, { x: 0, y: stage.height }, { x: stage.width, y: stage.height }]) {
      expect(Math.hypot(corner.x - avatar.x, corner.y - avatar.y)).toBeLessThan(g.reach);
    }
  });

  test("on the page, the portal is exactly the avatar and the room's portrait fills it", () => {
    const f = frameAt(g, 0);
    expect(f.portal * g.reach).toBeCloseTo(g.avatarRadius);
    const center = roomToStage(g, f, g.portrait);
    expect(center.x).toBeCloseTo(avatar.x);
    expect(center.y).toBeCloseTo(avatar.y);
    const edge = roomToStage(g, f, { x: g.portrait.x + g.portraitSize / 2, y: g.portrait.y });
    expect(edge.x - center.x).toBeCloseTo(g.avatarRadius);
  });

  test("inside, the portal covers the stage and the room sits at rest", () => {
    const f = frameAt(g, 1);
    expect(f.portal).toBeCloseTo(1);
    for (const q of [{ x: 0, y: 0 }, { x: 450, y: 320 }, { x: 900, y: 640 }]) {
      const p = roomToStage(g, f, q);
      expect(p.x).toBeCloseTo(q.x);
      expect(p.y).toBeCloseTo(q.y);
    }
  });

  test("the window grows faster than the room behind it, as a nearer surface would", () => {
    const start = frameAt(g, 0);
    const end = frameAt(g, 1);
    expect(end.portal / start.portal).toBeGreaterThan(end.roomScale / start.roomScale);
    let previous = frameAt(g, 0);
    for (let i = 1; i <= 20; i++) {
      const f = frameAt(g, i / 20);
      expect(f.portal).toBeGreaterThan(previous.portal);
      expect(f.roomScale).toBeGreaterThan(previous.roomScale);
      previous = f;
    }
  });

  test("every layer's keyframes share one set of offsets", () => {
    const { portal, room } = tracks(g);
    expect(portal).toHaveLength(SAMPLES + 1);
    expect(room.map(frame => frame.offset)).toEqual(portal.map(frame => frame.offset));
  });
});

describe("Profile Button room layout", () => {
  test("stacks the arrow above the head and the details below it, centered in the stage", () => {
    for (const stage of [{ width: 900, height: 640 }, { width: 322, height: 560 }, { width: 1300, height: 760 }]) {
      const layout = roomLayout(stage);
      const portraitTop = layout.portrait.y - layout.portraitSize / 2;
      expect(layout.arrowTop + ARROW_SIZE).toBeLessThanOrEqual(portraitTop);
      expect(layout.arrowX).toBe(layout.portrait.x);
      expect(layout.details.top).toBeGreaterThanOrEqual(portraitTop + layout.portraitSize);
      expect(layout.portrait.x).toBe(stage.width / 2);
      expect(layout.arrowTop).toBeGreaterThanOrEqual(0);
      expect(layout.details.top + DETAILS_HEIGHT).toBeLessThanOrEqual(stage.height);
      expect(layout.details.left + layout.details.width / 2).toBeCloseTo(stage.width / 2);
    }
  });

  test("on a short, wide stage the details move beside the portrait and nothing is cut off", () => {
    for (const stage of [{ width: 794, height: 250 }, { width: 1000, height: STACK_MIN_HEIGHT - 1 }]) {
      const layout = roomLayout(stage);
      expect(layout.details.strip).toBe(false);
      const portraitTop = layout.portrait.y - layout.portraitSize / 2;
      expect(layout.details.align).toBe("start");
      expect(layout.details.left).toBeGreaterThan(layout.portrait.x + layout.portraitSize / 2);
      expect(layout.details.left + layout.details.width).toBeLessThanOrEqual(stage.width);
      expect(layout.details.top).toBeGreaterThanOrEqual(0);
      expect(layout.details.top + DETAILS_HEIGHT).toBeLessThanOrEqual(stage.height);
      expect(layout.arrowTop).toBeGreaterThanOrEqual(0);
      expect(layout.arrowTop + ARROW_SIZE).toBeLessThanOrEqual(portraitTop);
      expect(portraitTop + layout.portraitSize).toBeLessThanOrEqual(stage.height);
    }
  });

  test("on a landscape phone the name sits beside the settings, at full size, with the arrow still above the head", () => {
    const stage = { width: 794, height: 154 };
    const layout = roomLayout(stage);
    const portraitTop = layout.portrait.y - layout.portraitSize / 2;
    expect(layout.details.strip).toBe(true);
    expect(layout.arrowTop).toBeGreaterThanOrEqual(0);
    expect(layout.arrowTop + ARROW_SIZE).toBeLessThanOrEqual(portraitTop);
    expect(portraitTop + layout.portraitSize).toBeLessThanOrEqual(stage.height);
    expect(layout.details.top + STRIP_HEIGHT).toBeLessThanOrEqual(stage.height);
    expect(layout.details.left + layout.details.width).toBeLessThanOrEqual(stage.width);
  });

  test("the portrait grows with the stage but stays a portrait, not a wall", () => {
    expect(roomLayout({ width: 322, height: 560 }).portraitSize).toBeLessThan(roomLayout({ width: 900, height: 900 }).portraitSize);
    expect(roomLayout({ width: 3000, height: 3000 }).portraitSize).toBeLessThanOrEqual(280);
  });
});

describe("Profile Button easing", () => {
  test("matches CSS cubic-bezier at its ends and for a known curve", () => {
    expect(PULL(0)).toBe(0);
    expect(PULL(1)).toBe(1);
    const ease = cubicBezier(0.25, 0.1, 0.25, 1);
    expect(ease(0.5)).toBeCloseTo(0.8024, 3);
    const linear = cubicBezier(0, 0, 1, 1);
    expect(linear(0.3)).toBeCloseTo(0.3, 4);
  });

  test("the pull gathers slowly before it rushes", () => {
    expect(PULL(0.2)).toBeLessThan(0.1);
    for (let i = 1; i <= 50; i++) expect(PULL(i / 50)).toBeGreaterThanOrEqual(PULL((i - 1) / 50));
  });
});
