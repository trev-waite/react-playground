# WebGPU with vgpu

Use npm `vgpu` (Vercel's library, [vgpu.sh](https://vgpu.sh)). Hang a canvas, start a session with `useGpu`, then use vgpu's `effect`, `frameLoop`, `clock`, and `sampler`.

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
import { effect, frameLoop } from "vgpu";
import { useGpu } from "@/gpu";

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
    start: ({ gpu, surface: canvasSurface }) => {
      const paint = effect(gpu, SHADER, { label: "Gradient" });
      const loop = frameLoop(gpu, frame => {
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

`start` runs once the canvas has layout and the playground layer is active. Return a cleanup that stops `frameLoop` and destroys textures you created. `gpu.dispose()` is the host's job.

Keep the shader in a `/* wgsl */` string. This app has no `.wgsl` import plugin yet.

vgpu UV is top-origin. `GPUTextureUsage` exists only after WebGPU is present, so read it inside `start`, not at module scope.

## Defaults that matter

`useGpu` waits for a real `clientWidth`/`clientHeight`, times out `init()` after 10s (some embedded browsers hang on `requestAdapter`), and skips the stacked Experimental layer while it is `inert` or `aria-hidden`. vgpu resizes the surface each frame. The host does not.

vgpu's canvas alpha mode is already `premultiplied`. Its clear color is opaque black (`[0, 0, 0, 1]`). The host passes `[0, 0, 0, 0]` so empty pixels show whatever sits under the canvas. If the first GPU frame is empty, put HTML behind the canvas instead of swapping it out when the session starts. Light Dispersion does that with "Hello There".

Pass `clearColor: [0, 0, 0, 1]` only when the shader is supposed to own the whole frame.

Do not put `transform: translateZ(0)`, `perspective`, or other CSS 3D on ancestors of a WebGPU canvas. Live uses that trick for its mask; Experimental does not. Size the stage with `inset` / `top` / `bottom`, not `transform`. `mix-blend-mode` on a WebGPU canvas is unreliable.

## Where to run it

Use Chrome or Safari with WebGPU enabled. Cursor's embedded browser often hangs on `navigator.gpu.requestAdapter()` and never configures the canvas.

Headless pixel checks use the same API through `vgpu/node`:

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
