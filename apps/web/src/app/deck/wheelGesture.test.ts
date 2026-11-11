import { describe, expect, test } from "bun:test";
import { GESTURE_GAP_MS, wheelGesture, type WheelIntent } from "./wheelGesture";

const COMMIT = 64;

/** Feeds `deltas` one frame apart from `start` ms and returns what each event asked for. */
function feed(gesture: ReturnType<typeof wheelGesture>, deltas: number[], start = 1000): WheelIntent[] {
  return deltas.map((delta, i) => gesture.read(delta, start + i * 16, COMMIT));
}

describe("wheel gesture", () => {
  test("a short scroll only pulls the page, following the travel", () => {
    const intents = feed(wheelGesture(), [5, 5, 5, 5]);
    expect(intents).toEqual([5, 10, 15, 20].map(travel => ({ type: "pull", travel })));
  });

  test("passing the threshold steps once and ignores the momentum after it", () => {
    const intents = feed(wheelGesture(), [30, 40, 50, 30, 20, 10, 5, 2]);
    expect(intents[0]).toEqual({ type: "pull", travel: 30 });
    expect(intents[1]).toEqual({ type: "step", direction: 1 });
    expect(intents.slice(2).every(intent => intent === null)).toBe(true);
  });

  test("a trackpad that speeds up keeps pulling from where it was", () => {
    const intents = feed(wheelGesture(), [2, 4, 9, 18]);
    expect(intents.map(intent => intent?.type === "pull" && intent.travel)).toEqual([2, 6, 15, 33]);
  });

  test("a new gesture after a pause can step again, in either direction", () => {
    const gesture = wheelGesture();
    feed(gesture, [70, 20, 10]);
    expect(gesture.read(-70, 1000 + 2 * 16 + GESTURE_GAP_MS + 1, COMMIT)).toEqual({ type: "step", direction: -1 });
  });

  test("momentum never steps twice, but a clearly stronger swipe after it does", () => {
    const gesture = wheelGesture();
    const momentum = [70, ...Array.from({ length: 30 }, () => 6)];
    const intents = feed(gesture, momentum);
    expect(intents.filter(intent => intent?.type === "step")).toHaveLength(1);
    expect(gesture.read(80, 1000 + momentum.length * 16, COMMIT)).toEqual({ type: "step", direction: 1 });
  });

  test("ending a pull starts the next scroll from rest", () => {
    const gesture = wheelGesture();
    feed(gesture, [20, 20]);
    gesture.end();
    expect(gesture.read(20, 1040, COMMIT)).toEqual({ type: "pull", travel: 20 });
  });
});
