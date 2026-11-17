import { OPEN_MS, PULL, frameAt, type Geometry, type Point } from "./portal";

/**
 * The presence dot through the camera move. It does not let the window close
 * over it: as the window starts to open it melts onto the window's rim and
 * spreads around it, a bead of blue hugging the black, then rides the rim out
 * past the stage's edge. Played backward, it rides back in and gathers into
 * the dot again.
 */

/** The dot where it sits on the avatar, in stage px. */
export type Dot = Point & { radius: number };

/** The white ring between the dot and the picture, which the bead keeps between itself and the window, slimming as the bead thins. */
export const RING = 3;
const MELTED_RING = 2;
/** The share of the flight over which the dot melts onto the rim: it answers the press at once, then settles onto the rim. */
const MELT = 0.42;
/** How long the dot takes to melt onto the rim under the pointer, or gather back: as long as it takes to melt in flight. */
export const HOVER_MS = MELT * OPEN_MS;
/** Under the pointer the dot melts on an ease-out of this power: it answers at once, without the lurch a press gets from 3. */
const MELT_IN_POWER = 2;
/** How far the dot spreads along the rim: its half-length, in dot radii, once it has melted. */
const SPREAD = 3.2;
/** How far (radians) the bead swirls around the rim as the window pulls the viewer in. */
const SWIRL = 0.3;
/** The bead never thins below this share of the dot's diameter, so it stays a bead rather than a hairline. */
const MIN_THICKNESS = 0.3;
/** Below 1, the bead's ends stay full and round off, as surface tension holds a drop, rather than tapering to points. */
const FULLNESS = 0.7;
/** Once thinned to its floor, the bead stops lengthening, so it never holds more blue than this share of the dot. */
const MAX_AREA = 1.1;
/** The share of the flight over which the bead curves from round to the rim's arc; it stretches at once but bends in gently. */
const BEND = 0.19;
/** Before it bends, the dot answers the press by stretching along the rim by up to this much, keeping its area. */
const SQUASH = 0.5;
/** As it swirls, the bead carries its weight at the trailing end and thins toward the leading one, by this share. */
const LEAN = 0.28;
const POINTS = 56;
/** How far the bead's layer reaches past the window's square, as a share of it: the bead hangs past that square, and a browser may clip what a layer draws outside its own box. */
export const TRACE_MARGIN = 0.4;

function clamp01(t: number) {
  return Math.min(1, Math.max(0, t));
}

function ease(t: number) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/** The window's radius `t` of the way through the flight (0 outside, 1 in the room). */
export function rimAt(g: Geometry, t: number): number {
  return g.reach * frameAt(g, PULL(clamp01(t))).portal;
}

/** How far the dot has melted and bent onto the rim: by the flight, or already under the pointer (`held`, 0 to 1). */
function shapeAt(t: number, held: number) {
  const hover = held * MELT;
  return {
    melt: 1 - (1 - melted(hover)) * (1 - melted(t)),
    bend: 1 - (1 - ease(hover / BEND)) * (1 - ease(t / BEND)),
  };
}

/**
 * The bead's outline `t` of the way through the flight, as points around it.
 * At 0 it is the dot exactly. As it melts it spreads along the rim, keeping
 * its area, with its inner edge one ring's width off the window and its outer
 * edge swelling like a drop resting on a curve. Under the pointer it melts
 * onto the avatar's rim the same way, and a flight goes on from there.
 */
export function beadOutline(g: Geometry, dot: Dot, t: number, held = 0): Point[] {
  const { avatar } = g;
  const { melt, bend } = shapeAt(t, held);
  const angle = Math.atan2(dot.y - avatar.y, dot.x - avatar.x) + SWIRL * ease(t);
  const resting = Math.hypot(dot.x - avatar.x, dot.y - avatar.y);
  const inner = 0.5 - 0.3 * melt;
  const reach = dot.radius * (1 + (SPREAD - 1) * melt);
  const rim = rimAt(g, t);
  const floor = MIN_THICKNESS * 2 * dot.radius;
  const length = Math.min(reach * Math.sqrt(Math.max(1, (rim + RING) / resting)), (MAX_AREA * 2 * dot.radius * dot.radius) / floor);
  const thickness = Math.max(floor, (2 * dot.radius * dot.radius) / length);
  const ring = ringAt(t, held);
  const middle = resting + (rim + ring + inner * thickness - resting) * melt;
  const squash = 1 + SQUASH * melt;
  const tangent = { x: -Math.sin(angle), y: Math.cos(angle) };
  const normal = { x: Math.cos(angle), y: Math.sin(angle) };
  const points: Point[] = [];
  for (let i = 0; i < POINTS; i++) {
    const psi = (i / POINTS) * Math.PI * 2;
    const along = Math.cos(psi);
    const across = Math.sin(psi);
    const full = Math.sign(across) * Math.pow(Math.abs(across), FULLNESS);
    const round = {
      x: dot.x + dot.radius * (along * squash * tangent.x + (across / squash) * normal.x),
      y: dot.y + dot.radius * (along * squash * tangent.y + (across / squash) * normal.y),
    };
    const at = angle + (length * along) / middle;
    const belly = 1 - LEAN * along * melt;
    const radius = middle + thickness * belly * full * (across > 0 ? 1 - inner : inner);
    const bent = { x: avatar.x + radius * Math.cos(at), y: avatar.y + radius * Math.sin(at) };
    points.push({ x: round.x + (bent.x - round.x) * bend, y: round.y + (bent.y - round.y) * bend });
  }
  return points;
}

export function ringAt(t: number, held = 0): number {
  return RING + (MELTED_RING - RING) * shapeAt(t, held).melt;
}

function melted(t: number): number {
  return 1 - Math.pow(1 - clamp01(t / MELT), 3);
}

/** How far the dot has melted under the pointer `ms` after `held`, from wherever it was. */
export function meltIn(held: number, ms: number): number {
  const at = 1 - Math.pow(1 - clamp01(held), 3 / MELT_IN_POWER);
  return 1 - Math.pow(1 - clamp01(at + ms / HOVER_MS), MELT_IN_POWER / 3);
}

/** The bead's outline and the width of its white ring, in the window's space. */
export type Bead = { path: string; stroke: number };

/**
 * The bead `ms` into the flight, drawn in the window's own space: a box the
 * window's open size plus `TRACE_MARGIN`, centered on the avatar, that scales with the window.
 * Riding the window's own scale keeps the bead on the rim even when it is
 * redrawn a frame or two behind the window. Empty once it has left the stage.
 */
export function beadAt(g: Geometry, dot: Dot, ms: number, held = 0): Bead {
  const t = ms / OPEN_MS;
  const points = beadOutline(g, dot, t, held);
  const margin = RING;
  const onStage = points.some(p => p.x > -margin && p.y > -margin && p.x < g.stage.width + margin && p.y < g.stage.height + margin);
  const scale = rimAt(g, t) / g.reach;
  const half = g.reach * (1 + TRACE_MARGIN);
  const local = (p: Point) => `${(half + (p.x - g.avatar.x) / scale).toFixed(2)} ${(half + (p.y - g.avatar.y) / scale).toFixed(2)}`;
  return { path: onStage ? `M${points.map(local).join("L")}Z` : "", stroke: (ringAt(t, held) * 2) / scale };
}
