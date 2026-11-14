import { drawStill } from "./still";

export type StillRequest = { id: number; width: number; height: number };
export type StillResult = StillRequest & { pixels: Uint8ClampedArray<ArrayBuffer> };

/** Draws the still relief off the main thread, which it would otherwise hold for a long moment on a slow device. */
self.onmessage = ({ data }: MessageEvent<StillRequest>) => {
  const pixels = drawStill(data.width, data.height);
  const result: StillResult = { ...data, pixels };
  self.postMessage(result, { transfer: [pixels.buffer] });
};
