import { animate, motionValue, type MotionValue, type Transition } from "motion/react";
import type { CardPose } from "./deckLayout";

/** Live values a card renders from. The deck drives them; React never re-renders for motion. */
export type CardMotion = {
  left: MotionValue<number>;
  top: MotionValue<number>;
  width: MotionValue<number>;
  height: MotionValue<number>;
  x: MotionValue<number>;
  y: MotionValue<number>;
  scale: MotionValue<number>;
  radius: MotionValue<number>;
  chrome: MotionValue<number>;
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

export function createCardMotion(pose: CardPose): CardMotion {
  return {
    left: motionValue(pose.rect.x),
    top: motionValue(pose.rect.y),
    width: motionValue(pose.rect.width),
    height: motionValue(pose.rect.height),
    x: motionValue(pose.x),
    y: motionValue(pose.y),
    scale: motionValue(pose.scale),
    radius: motionValue(pose.radius),
    chrome: motionValue(pose.chrome),
  };
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
