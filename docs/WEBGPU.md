# WebGPU with vgpu

Use npm `vgpu` (Vercel's library, [vgpu.sh](https://vgpu.sh)). Hang a canvas, start a session with `useGpu`, then use vgpu's `effect`, `clock`, and `sampler` with the host's `pausableLoop`.

Building a new GPU idea? Follow the `gpu-idea` skill in `.cursor/skills/gpu-idea/SKILL.md`. This page is the reference behind it.

## Layout

```
apps/web/src/gpu/           playground host (React session + layer gating)
apps/web/src/experimental/ideas/<Name>/source.tsx
apps/web/src/app/AppShell   Live layer may use CSS 3D; Experimental must not
```

GPU ideas import `@/gpu`. That is the exception to "don't import from lib". `app/` and `lib/` stay off limits. After Make Live the published component keeps the `@/gpu` import so it still runs in this repo. Copying that Live folder into another app also needs the `vgpu` package and `apps/web/src/gpu/`.

## Write a GPU idea

```tsx
import { useRef } from "react";
import { effect } from "vgpu";
import { pausableLoop, useGpu } from "@/gpu";

const SLIDERS = { slider1: 50, slider2: 50, slider3: 50 };

const SHADER = /* wgsl */ `
@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  return vec4f(uv, 0.4, 1.0);
}
`;

export function Example() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useGpu(canvasRef, {
    label: "Gradient",
    start: ({ gpu, surface: canvasSurface, canvas }) => {
      const paint = effect(gpu, SHADER, { label: "Gradient" });
      const loop = pausableLoop(gpu, canvas, frame => {
        frame.pass(canvasSurface, paint);
      });
      return () => loop.stop();
    },
  });

  return (
    <canvas
      ref={canvasRef}
      style={{ display: "block", width: "100%", height: "100%" }}
    />
  );
}
```

`start` runs once the canvas has layout and the playground layer is active. Return a cleanup that stops the loop and destroys textures you created. `gpu.dispose()` is the host's job.

Keep the shader in a `/* wgsl */` string. This app has no `.wgsl` import plugin yet.

vgpu UV is top-origin. `GPUTextureUsage` exists only after WebGPU is present, so read it inside `start`, not at module scope.

## Host helpers (`@/gpu`)

| Export | Use when |
| --- | --- |
| `useGpu(canvasRef, { label, start, alphaMode?, clearColor?, dpr?, features? })` | Every GPU idea. `dpr` overrides the `[1, 2]` clamp for heavy effects (`[1, 1.5]`). `features` requests optional device features (`["timestamp-query"]`) and falls back to none if the adapter lacks them. |
| `pausableLoop(gpu, canvas, cb)` | Instead of `frameLoop`. Stops while the canvas is scrolled out of view or the tab is hidden. |
| `WGSL_HASH`, `WGSL_NOISE`, `WGSL_SPECTRUM`, `WGSL_TONEMAP` | Shared WGSL functions. Concatenate ahead of your shader body: `WGSL_HASH + WGSL_NOISE + BODY`. Integer `hash21`/`hash22`, `valueNoise`/`fbm`/`ridged`, `spectrum(t)` (0 violet, 1 red), `tonemapSoft`/`tonemapNorm`/`luminance`. |
| `createTextMask(gpu, { text, font })` | Text as an input texture. Canvas2D raster copied into a texture with `copyExternalImageToTexture`; `update(w, h)` swaps textures and retires the old one a step late so a bound texture is never destroyed mid-frame. |
| `createBlurChain(gpu, { levels, radius, format })` | Wide blur or glow of any texture. Half-resolution levels blurred separably; bind `chain.levels[i]` and read it with one `textureSampleLevel`. |
| `gaussianKernel`, `bilinearGaussianTaps` | Pure weight math behind the blur chain, if you build your own kernel. |

vgpu pieces ideas use directly: `effect`, `sampler`, `clock`, `target` (offscreen pass), `pingPong` (feedback, fluids, trails), `frame`, `timer`.

## Precompute on resize, sample per frame

Anything that only changes with the canvas size (uploaded textures, blur pyramids, lookup targets) is built once per size, not per frame. Two rules:

- `surface.onResize` fires on every size change, including each frame of a drag. Do not rasterise or encode there. Store the size and set a dirty flag.
- `frame()` inside `onResize` throws `VGPU-FRAME-REENTRANT`. Flush the dirty flag at the top of the loop callback, which already has a frame.

```ts
let pendingSize: [number, number] | null = null;
canvasSurface.onResize(({ width, height }) => {
  pendingSize = [width, height];
});

const loop = pausableLoop(gpu, canvas, frame => {
  if (pendingSize) {
    const [width, height] = pendingSize;
    pendingSize = null;
    const mask = textMask.update(width, height);
    glow.resize([width, height]);
    glow.render(frame, mask);
    paint.set({ textMask: mask, params: { resolution: [width, height] } });
  }
  frame.pass(canvasSurface, paint);
});
```

The main pass then reads each precomputed input with a single bilinear tap. Light Dispersion went from 81 texture reads per pixel to about 11 this way.

## Measure

Pass `features: ["timestamp-query"]` to `useGpu`, then `timer(gpu)` from vgpu: `frame.pass({ target, timer: gpuTimer.span("main") }, paint)` and `gpuTimer.onResults(spans => ...)`. Keep it behind a dev flag; the feature is absent on some adapters and the host falls back silently.

## Defaults that matter

`useGpu` waits for a real `clientWidth`/`clientHeight`, times out `init()` after 10s (some embedded browsers hang on `requestAdapter`), and skips the stacked Experimental layer while it is `inert` or `aria-hidden`. vgpu resizes the surface each frame. The host does not.

vgpu's canvas alpha mode is already `premultiplied`. Its clear color is opaque black (`[0, 0, 0, 1]`). The host passes `[0, 0, 0, 0]` so empty pixels show whatever sits under the canvas. If the first GPU frame is empty, put HTML behind the canvas instead of swapping it out when the session starts. Light Dispersion does that with "Hello There".

Pass `clearColor: [0, 0, 0, 1]` only when the shader is supposed to own the whole frame.

Do not put `transform: translateZ(0)`, `perspective`, or other CSS 3D on ancestors of a WebGPU canvas. Live uses that trick for its mask; Experimental does not. Size the stage with `inset` / `top` / `bottom`, not `transform`. `mix-blend-mode` on a WebGPU canvas is unreliable.

## Where to run it

Chrome, Safari, or Cursor's embedded browser with WebGPU enabled. The embedded browser usually works; when it does not, the symptom is `navigator.gpu.requestAdapter()` hanging until the host's 10s timeout and a blank canvas. Fall back to Chrome or Safari in that case.

Headless pixel checks use the same API through `vgpu/node` (Dawn). Run them outside any sandbox that blocks Metal, and add `await module.getCompilationInfo()` on `gpu.gpu.createShaderModule({ code })` to surface WGSL errors with line numbers:

```ts
import { effect, frame, init, target } from "vgpu/node";

const gpu = await init();
const colorTarget = target(gpu, { size: [256, 256], format: "rgba8unorm" });
const paint = effect(gpu, SHADER, { label: "Check" });
frame(gpu, f => f.pass(colorTarget, paint));
const pixels = await colorTarget.read();
gpu.dispose();
```

Package docs and examples: `bunx vgpu docs cat getting-started.md`, or [vgpu.sh/docs/get-started](https://vgpu.sh/docs/get-started).
