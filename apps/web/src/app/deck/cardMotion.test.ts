import { describe, expect, test } from "bun:test";
import { CardMotions, nearPose } from "./cardMotion";
import { pagePose } from "./deckLayout";

const page = pagePose({ x: 16, y: 16, width: 1408, height: 868 });

describe("nearPose", () => {
  test("holds within half a pixel of a pose and not beyond, on box, chrome, and scale alike", () => {
    const motion = new CardMotions().for("card", page);
    expect(nearPose(motion, page)).toBe(true);
    motion.width.jump(1408.4);
    expect(nearPose(motion, page)).toBe(true);
    motion.width.jump(1408.6);
    expect(nearPose(motion, page)).toBe(false);
    motion.width.jump(1408);
    motion.chrome.jump(0.995);
    expect(nearPose(motion, page)).toBe(true);
    motion.chrome.jump(0.99);
    expect(nearPose(motion, page)).toBe(false);
    motion.chrome.jump(1);
    motion.scale.jump(1.001);
    expect(nearPose(motion, page)).toBe(false);
  });
});
