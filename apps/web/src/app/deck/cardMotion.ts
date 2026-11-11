import { animate, MotionValue } from "../motion/motionValue";
import type { Transition } from "../motion/transitions";
import type { CardPose } from "./deckLayout";

/** Live values a card renders from. The deck drives them; React never re-renders for motion. */
export type CardMotion = {
  left: MotionValue;
  top: MotionValue;
  width: MotionValue;
  height: MotionValue;
  x: MotionValue;
  y: MotionValue;
  scale: MotionValue;
  radius: MotionValue;
  chrome: MotionValue;
};

function entries(pose: CardPose): [keyof CardMotion, number][] {
  return [
    ["left", pose.rect.x],
    ["top", pose.rect.y],
    ["width", pose.rect.width],
    ["height", pose.rect.height],
    ["x", pose.x],
    ["y", pose.y],
    ["scale", pose.scale],
    ["radius", pose.radius],
    ["chrome", pose.chrome],
  ];
}

function createCardMotion(pose: CardPose): CardMotion {
  return {
    left: new MotionValue(pose.rect.x),
    top: new MotionValue(pose.rect.y),
    width: new MotionValue(pose.rect.width),
    height: new MotionValue(pose.rect.height),
    x: new MotionValue(pose.x),
    y: new MotionValue(pose.y),
    scale: new MotionValue(pose.scale),
    radius: new MotionValue(pose.radius),
    chrome: new MotionValue(pose.chrome),
  };
}

function stopCard(motion: CardMotion) {
  for (const value of Object.values(motion)) value.stop();
}

/** Every card's motion by slug, so a card keeps its place across layouts and catalog changes. */
export class CardMotions {
  readonly #motions = new Map<string, CardMotion>();

  /** The card's motion, starting at `pose` the first time it is asked for. */
  for(slug: string, pose: CardPose): CardMotion {
    let motion = this.#motions.get(slug);
    if (!motion) {
      motion = createCardMotion(pose);
      this.#motions.set(slug, motion);
    }
    return motion;
  }

  /** Stops and forgets every card not in `slugs`. */
  keep(slugs: ReadonlySet<string>) {
    for (const [slug, motion] of this.#motions) {
      if (slugs.has(slug)) continue;
      stopCard(motion);
      this.#motions.delete(slug);
    }
  }

  stopAll() {
    for (const motion of this.#motions.values()) stopCard(motion);
  }
}

/** Places a card without animating, cancelling any flight in progress. */
export function jumpCard(motion: CardMotion, pose: CardPose) {
  for (const [key, value] of entries(pose)) motion[key].jump(value);
}

export function moveCard(
  motion: CardMotion,
  pose: CardPose,
  transition: Transition,
): Promise<void> {
  return Promise.all(
    entries(pose).map(([key, value]) => animate(motion[key], value, transition).finished),
  ).then(() => undefined);
}
