/**
 * The camera move into the profile picture. The avatar is a window: it opens
 * into a circle (the portal) that grows until it covers the stage, while the
 * room behind grows from a miniature that fits the avatar to full size. The
 * room grows less than the window, as something farther away would.
 */

export type Point = { x: number; y: number };
export type Size = { width: number; height: number };

/**
 * The room: the back arrow centered above the portrait, and the profile's
 * name and settings below it, or beside it when the stage is too short.
 */
export type RoomLayout = {
  /** The arrow's top edge and center. */
  arrowTop: number;
  arrowX: number;
  portrait: Point;
  portraitSize: number;
  /** `strip` lays the name beside the settings, for stages too short to stack them. */
  details: { left: number; top: number; width: number; align: "center" | "start"; strip: boolean };
};

export type Geometry = RoomLayout & {
  stage: Size;
  /** Avatar center, in stage px. */
  avatar: Point;
  avatarRadius: number;
  /** The portal's radius once open: far enough to cover every corner of the stage. */
  reach: number;
};

export const ARROW_SIZE = 44;
const ARROW_GAP = 8;
const DETAILS_GAP = 16;
/** Name, handle, and two settings rows. */
export const DETAILS_HEIGHT = 196;
const MARGIN = 24;
const MIN_PORTRAIT = 96;
const MAX_PORTRAIT = 280;
const DETAILS_WIDTH = 352;
/** Below this stage height the details sit beside the portrait instead of under it. */
export const STACK_MIN_HEIGHT = ARROW_SIZE + ARROW_GAP + MIN_PORTRAIT + DETAILS_GAP + DETAILS_HEIGHT + MARGIN * 2;
/** The settings alone (segmented control over the switch row), for the strip layout. */
export const STRIP_HEIGHT = 104;
/** Name and settings side by side need this much width. */
const STRIP_WIDTH = 500;
const SIDE_GAP = 32;
const TIGHT_MARGIN = 8;

/** Samples per transform keyframe track. Linear between them, so every layer stays on one curve. */
export const SAMPLES = 32;
export const OPEN_MS = 1000;
/** Zooming back out plays the same move backward, a little quicker. */
export const CLOSE_RATE = 1.3;

/** Lays out the room as large as the stage allows, centered. */
export function roomLayout(stage: Size): RoomLayout {
  const arrow = ARROW_SIZE + ARROW_GAP;
  const sideHeight = DETAILS_HEIGHT + MARGIN;
  if (stage.height < sideHeight && stage.width > stage.height) {
    const tightArrow = ARROW_SIZE + TIGHT_MARGIN / 2;
    const portraitSize = Math.max(56, Math.min(120, stage.height - TIGHT_MARGIN * 2 - tightArrow));
    const detailsWidth = Math.min(STRIP_WIDTH, stage.width - portraitSize - SIDE_GAP - MARGIN * 2);
    const left = (stage.width - (portraitSize + SIDE_GAP + detailsWidth)) / 2;
    const top = Math.max(TIGHT_MARGIN / 2, (stage.height - tightArrow - portraitSize) / 2);
    const portrait = { x: left + portraitSize / 2, y: top + tightArrow + portraitSize / 2 };
    return {
      arrowTop: top,
      arrowX: portrait.x,
      portrait,
      portraitSize,
      details: {
        left: left + portraitSize + SIDE_GAP,
        top: Math.max(0, (stage.height - STRIP_HEIGHT) / 2),
        width: detailsWidth,
        align: "start",
        strip: true,
      },
    };
  }
  if (stage.height < STACK_MIN_HEIGHT && stage.width > stage.height) {
    const portraitSize = Math.max(64, Math.min(240, stage.height - MARGIN * 2 - arrow, stage.width * 0.36));
    const detailsWidth = Math.min(DETAILS_WIDTH - 32, stage.width - portraitSize - SIDE_GAP - MARGIN * 2);
    const left = (stage.width - (portraitSize + SIDE_GAP + detailsWidth)) / 2;
    const top = Math.max(MARGIN / 2, (stage.height - arrow - portraitSize) / 2);
    const portrait = { x: left + portraitSize / 2, y: top + arrow + portraitSize / 2 };
    return {
      arrowTop: top,
      arrowX: portrait.x,
      portrait,
      portraitSize,
      details: {
        left: left + portraitSize + SIDE_GAP,
        top: Math.max(MARGIN / 2, Math.min(stage.height - DETAILS_HEIGHT - MARGIN / 2, stage.height / 2 - DETAILS_HEIGHT / 2)),
        width: detailsWidth,
        align: "start",
        strip: false,
      },
    };
  }
  const chrome = arrow + DETAILS_GAP + DETAILS_HEIGHT;
  const portraitSize = Math.max(MIN_PORTRAIT, Math.min(MAX_PORTRAIT, stage.width * 0.6, stage.height - chrome - MARGIN * 2));
  const top = Math.max(MARGIN, (stage.height - chrome - portraitSize) / 2);
  const width = Math.min(DETAILS_WIDTH, stage.width - 32);
  return {
    arrowTop: top,
    arrowX: stage.width / 2,
    portrait: { x: stage.width / 2, y: top + arrow + portraitSize / 2 },
    portraitSize,
    details: { left: (stage.width - width) / 2, top: top + arrow + portraitSize + DETAILS_GAP, width, align: "center", strip: false },
  };
}

export function geometry(stage: Size, avatar: Point, avatarRadius: number): Geometry {
  const reach =
    Math.max(
      Math.hypot(avatar.x, avatar.y),
      Math.hypot(stage.width - avatar.x, avatar.y),
      Math.hypot(avatar.x, stage.height - avatar.y),
      Math.hypot(stage.width - avatar.x, stage.height - avatar.y),
    ) + 2;
  return { ...roomLayout(stage), stage, avatar, avatarRadius, reach };
}

/** Geometric interpolation: a zoom that feels even, the way a camera dolly does. */
function zoom(from: number, to: number, e: number): number {
  return from * Math.pow(to / from, e);
}

export type Frame = {
  /** Scale of the portal circle about the avatar. Its full size is `reach`. */
  portal: number;
  /** The room inside the portal, which cancels the portal's scale: translate, then scale, from its top left. */
  room: { x: number; y: number; scale: number };
  /** The room's own scale on screen. */
  roomScale: number;
};

/**
 * Every layer at camera progress `e` (0 outside, 1 in the room). At 0 the
 * room's portrait fills the avatar exactly; at 1 the portal covers the stage
 * and the room sits at rest.
 */
export function frameAt(g: Geometry, e: number): Frame {
  const { avatar: a, avatarRadius: r, reach } = g;
  const portal = zoom(r / reach, 1, e);
  const roomScale = zoom((2 * r) / g.portraitSize, 1, e);
  const center = { x: g.portrait.x + (a.x - g.portrait.x) * e, y: g.portrait.y + (a.y - g.portrait.y) * e };
  const k = roomScale / portal;
  return { portal, room: { x: a.x - k * center.x, y: a.y - k * center.y, scale: k }, roomScale };
}

/** Where a room point lands on the stage at frame `f`, through the portal. */
export function roomToStage(g: Geometry, f: Frame, q: Point): Point {
  const local = {
    x: g.reach - g.avatar.x + f.room.x + q.x * f.room.scale,
    y: g.reach - g.avatar.y + f.room.y + q.y * f.room.scale,
  };
  return { x: g.avatar.x + f.portal * (local.x - g.reach), y: g.avatar.y + f.portal * (local.y - g.reach) };
}

/** A CSS cubic-bezier as a function of time, solved by Newton's method with a bisection fallback. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const curve = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3;
  const slope = (a: number, b: number, s: number) => 3 * a * (1 - s) ** 2 + 6 * (b - a) * s * (1 - s) + 3 * (1 - b) * s * s;
  return t => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let s = t;
    for (let i = 0; i < 8; i++) {
      const error = curve(x1, x2, s) - t;
      if (Math.abs(error) < 1e-6) return curve(y1, y2, s);
      const d = slope(x1, x2, s);
      if (Math.abs(d) < 1e-6) break;
      s -= error / d;
    }
    let low = 0;
    let high = 1;
    s = t;
    for (let i = 0; i < 30; i++) {
      if (curve(x1, x2, s) < t) low = s;
      else high = s;
      s = (low + high) / 2;
    }
    return curve(y1, y2, s);
  };
}

/** Gathers in slowly, then pulls hard, and eases to rest inside: the feel of being drawn in. */
export const PULL = cubicBezier(0.72, 0, 0.16, 1);

export type Tracks = { portal: Keyframe[]; room: Keyframe[] };

/** Keyframes for the portal and the room, sampled on one curve so they never drift apart. */
export function tracks(g: Geometry, ease = PULL): Tracks {
  const portal: Keyframe[] = [];
  const room: Keyframe[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const offset = i / SAMPLES;
    const f = frameAt(g, ease(offset));
    portal.push({ offset, transform: `scale(${f.portal})` });
    room.push({ offset, transform: `translate(${f.room.x}px, ${f.room.y}px) scale(${f.room.scale})` });
  }
  return { portal, room };
}
