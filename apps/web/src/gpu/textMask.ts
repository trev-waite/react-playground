import type { Gpu } from "vgpu";

export type TextMaskOptions = {
  text: string;
  /** CSS font shorthand for a given pixel size, e.g. `size => \`800 ${size}px system-ui\``. */
  font: (size: number) => string;
  label?: string;
  /** Fraction of the canvas width the text may fill. Defaults to 0.84. */
  fitWidth?: number;
  /** Starting size as fractions of canvas height and width. Defaults to 0.3 / 0.18. */
  scale?: { height: number; width: number };
  /** Text baseline as a fraction of canvas height. Defaults to 0.49. */
  baseline?: number;
  /** Softening blur in CSS px per canvas pixel of height. Defaults to 0.0028 (min 0.8px). */
  softness?: number;
};

export type TextMask = {
  /** White text on black, `rgba8unorm`. Replaced by `update`; old textures are destroyed. */
  readonly texture: GPUTexture;
  /** Rasterises at the new size and uploads. Returns the new texture. */
  update(width: number, height: number): GPUTexture;
  destroy(): void;
};

function rasterise(canvas: HTMLCanvasElement, width: number, height: number, options: TextMaskOptions) {
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Text mask: 2D canvas context unavailable");

  const scale = options.scale ?? { height: 0.3, width: 0.18 };
  const fitWidth = options.fitWidth ?? 0.84;
  const softness = options.softness ?? 0.0028;

  context.fillStyle = "#000";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#fff";
  context.textAlign = "center";
  context.textBaseline = "middle";

  let fontSize = Math.min(height * scale.height, width * scale.width);
  context.font = options.font(fontSize);
  const measured = context.measureText(options.text).width;
  fontSize *= Math.min(1, (width * fitWidth) / Math.max(measured, 1));
  context.font = options.font(fontSize);
  context.filter = `blur(${Math.max(0.8, height * softness)}px)`;
  context.fillText(options.text, width * 0.5, height * (options.baseline ?? 0.49));
}

/**
 * Text rasterised with Canvas2D and uploaded as a texture. The canvas is copied straight into the
 * texture (`copyExternalImageToTexture`), so there is no CPU readback. Call `update` from the frame
 * loop when a pending resize is flushed, not from `surface.onResize`.
 */
export function createTextMask(gpu: Gpu, options: TextMaskOptions): TextMask {
  const label = options.label ?? `Text mask: ${options.text}`;
  // GPUTextureUsage only exists once WebGPU is present, so read it here rather than at module scope.
  const usage =
    GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT;
  const canvas = document.createElement("canvas");
  let texture = gpu.gpu.createTexture({ label, size: [1, 1], format: "rgba8unorm", usage });
  // The previous texture may still be bound until the caller re-sets it, so retire it one update late.
  let retired: GPUTexture | null = null;

  return {
    get texture() {
      return texture;
    },
    update(width, height) {
      const nextWidth = Math.max(1, Math.floor(width));
      const nextHeight = Math.max(1, Math.floor(height));
      rasterise(canvas, nextWidth, nextHeight, options);
      const next = gpu.gpu.createTexture({
        label,
        size: [nextWidth, nextHeight],
        format: "rgba8unorm",
        usage,
      });
      gpu.gpu.queue.copyExternalImageToTexture(
        { source: canvas },
        { texture: next },
        { width: nextWidth, height: nextHeight },
      );
      retired?.destroy();
      retired = texture;
      texture = next;
      return next;
    },
    destroy() {
      retired?.destroy();
      retired = null;
      texture.destroy();
    },
  };
}
