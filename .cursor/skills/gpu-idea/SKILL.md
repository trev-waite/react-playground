---
name: gpu-idea
description: Build or review a WebGPU idea in this playground using vgpu and the @/gpu host (useGpu, pausable frame loop, shared WGSL snippets, text masks, blur chains). Use when creating, editing, optimising, or reviewing a shader-based Experimental idea or GPU Live component.
disable-model-invocation: true
---

# GPU Idea

Any idea that renders through a canvas with `vgpu`. The idea folder, `project.json`, dock sliders, and Make Live follow the `new-experiment` skill; this skill covers only the GPU part. Reference behind it: [WebGPU with vgpu](../../../docs/WEBGPU.md).

## Checklist

Copy this and track it:

```text
- [ ] canvas + useGpu(canvasRef, { label, start }); HTML fallback sits behind the canvas
- [ ] shader is a /* wgsl */ string, composed from @/gpu WGSL_* snippets where they apply
- [ ] resolution-dependent inputs (uploaded textures, offscreen targets) are built once per size:
      onResize stores the size, the loop flushes it; nothing is encoded inside onResize
- [ ] one Params struct: resolution, time, pointer first, then idea fields; sliders read from
      settingsRef every frame, normalised to 0..1; defaults come from SLIDERS
- [ ] pausableLoop instead of frameLoop
- [ ] cleanup: stop the loop, unsubscribe resize/error, destroy textures and chains you created
- [ ] reduced motion honoured: time frozen, pointer influence off
- [ ] transparent output is premultiplied (rgb <= alpha)
- [ ] budget: texture taps per pixel, DPR, offscreen target sizes
- [ ] Live host: catalog frame fills the stage; GPU surface has a non-zero layout box (content-sized plaque or explicit min-height), not a 0-height `height: 100%` child of a centered auto grid
- [ ] verified headless (vgpu/node compile + pixels) and in a browser; see Verify
```

## Skeleton

```tsx
import { useRef } from "react";
import { clock, effect } from "vgpu";
import { pausableLoop, useGpu, WGSL_HASH, WGSL_NOISE } from "@/gpu";

const SLIDERS = { slider1: 50, slider2: 50, slider3: 50 };

const SHADER = WGSL_HASH + WGSL_NOISE + /* wgsl */ `
struct Params {
  resolution: vec2f,
  pointer: vec2f,
  time: f32,
  amount: f32,
}
@group(0) @binding(0) var<uniform> params: Params;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let n = valueNoise(uv * 6.0 + vec2f(params.time * 0.2, 0.0));
  let rgb = mix(vec3f(uv, 0.4), vec3f(n), params.amount);
  return vec4f(rgb, 1.0);
}
`;

export function Example({
  sliders = SLIDERS,
  progress = 1,
}: { sliders?: Record<string, number>; progress?: number } = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const settingsRef = useRef({ sliders, progress });
  settingsRef.current = { sliders, progress };

  const { status } = useGpu(canvasRef, {
    label: "My idea",
    start: ({ gpu, surface: canvasSurface, canvas }) => {
      const time = clock(gpu);
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
      const paint = effect(gpu, SHADER, {
        label: "My idea",
        set: { params: { resolution: [1, 1], pointer: [0.5, 0.5], time: 0, amount: SLIDERS.slider1 / 100 } },
      });

      let pendingSize: [number, number] | null = null;
      const unsubscribeResize = canvasSurface.onResize(({ width, height }) => {
        pendingSize = [width, height];
      });

      const loop = pausableLoop(gpu, canvas, frame => {
        if (pendingSize) {
          paint.set({ params: { resolution: pendingSize } });
          pendingSize = null;
        }
        const { sliders: current } = settingsRef.current;
        paint.set({
          params: {
            time: reducedMotion.matches ? 0 : time.time,
            amount: (current.slider1 ?? SLIDERS.slider1) / 100,
          },
        });
        frame.pass(canvasSurface, paint);
      });

      return () => {
        loop.stop();
        unsubscribeResize();
      };
    },
  });

  return (
    <div style={{ display: "grid", placeItems: "center", width: "100%", height: "100%", containerType: "size" }}>
      <div style={{ position: "relative", padding: "1.15rem 1.85rem", borderRadius: "1rem", background: "#000" }}>
        <span style={{ fontSize: "min(30cqh, 16.1cqw)", visibility: "hidden", whiteSpace: "nowrap" }}>Label</span>
        <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      </div>
    </div>
  );
}
```

Pointer input: track `pointerdown/move/up/cancel/leave` on the canvas, ease the pointer and a 0..1 `pointerStrength` in JS with `1 - exp(-dt * k)`, and pass both as uniforms. Gate every pointer effect in WGSL by a gaussian of the distance times `pointerStrength`.

## Building blocks

Pick only what the idea needs.

| Export | Use when |
| --- | --- |
| `useGpu` (`label`, `start`, `alphaMode?`, `clearColor?`, `dpr?`, `features?`) | Always. `dpr: [1, 1.5]` for heavy effects. `features: ["timestamp-query"]` to time passes. |
| `pausableLoop(gpu, canvas, cb)` | Always, instead of `frameLoop`. |
| `WGSL_HASH` | Any randomness. `hash21`, `hash22` are integer hashes. |
| `WGSL_NOISE` (needs `WGSL_HASH`) | `valueNoise`, `fbm`, `ridged` for drift, turbulence, texture. |
| `WGSL_SPECTRUM` | `spectrum(t)` rainbow ramp, 0 violet to 1 red. Divide by summed weights to keep whites white. |
| `WGSL_TONEMAP` | `tonemapSoft`, `tonemapNorm`, `luminance` when accumulating light. |
| `createTextMask(gpu, { text, font })` | Text as an input texture. |
| `createBlurChain(gpu, { levels, radius, format })` | Wide blur or glow of any texture. Bind `chain.levels[i]`, sample once. |
| vgpu `target` | Any offscreen pass. |
| vgpu `pingPong` | Feedback: trails, fluids, reaction-diffusion. |
| vgpu `sampler`, `clock`, `frame`, `timer` | Samplers are cached by descriptor; `clock` gives `time` and `deltaTime`. |

Binding notes:

- `effect.set()` takes a `Target` directly and re-binds it after `resize()`. Bind `chain.levels[i]` or a target, not `.color`. A raw `GPUTexture` also works but you own its lifetime.
- Use one `effect` per uniform configuration that runs in the same frame (the blur chain has a horizontal and a vertical effect per level). Do not call `set()` twice on one effect between two passes and expect both values to land.
- WGSL texture handles can be function parameters: `fn sampleMask(tex: texture_2d<f32>, uv: vec2f) -> f32` keeps multi-input shaders tidy.

## Shader rules

- UV is top-origin. `pixel = 1 / resolution`. Multiply x by `resolution.x / resolution.y` before measuring distances.
- Accumulate light additively into an HDR value, tonemap once at the end, then derive alpha from the result.
- Anything wide (blur, glow, large kernels) is a precomputed input read with one `textureSampleLevel`. Never loop many taps in the main pass.
- Integer hashes only. Quantise the time fed to noise or grain (`floor(time * 24)`) so it does not flicker per frame.
- Pointer influence is a gaussian of an eased `pointerStrength` computed in JS. Do not ease in WGSL.
- Keep `Params` field order stable. Append new fields at the end.
- Size effects relative to `resolution` (fractions of height), not fixed pixel counts, so DPR and window size do not change the look.
- Splitting one sample into N normalised taps keeps the interior exact but leaves partial-coverage regions at about 1/N energy. If those regions are the effect (fringes, edges, rims), add a boost gated by `(1 - core)`.
- Keep inputs crisp when you read them with several offset taps; pre-blurring the input smears the taps together. Put softness in the output (glow levels, tonemap), not the source.
- Pointer-driven effects keep a floor independent of any ambient slider (`0.35 + motion`), or they vanish at the low settings people actually pick.

## Performance budget

- Under 16 texture taps per pixel in the main pass.
- DPR clamp `[1, 2]` by default; drop to `[1, 1.5]` if the effect is fill-rate bound.
- Precomputed inputs at 1/2, 1/4, 1/8 resolution unless sharpness needs more.
- Rebuild inputs only when the size changes, flushed from the loop.
- Measure with `timer(gpu)` behind `features: ["timestamp-query"]` when tuning.

## Never

- `navigator.gpu` outside `useGpu`.
- `GPUTextureUsage` at module scope. Read it inside `start` or a helper.
- `frame()` or `gpu` work inside `surface.onResize`.
- CSS 3D transforms, `perspective`, or `mix-blend-mode` on the canvas or its ancestors. Live’s layer uses `isolation: isolate`, not `translateZ(0)`.
- A module-level `Map` of `lazy()` Live previews built once at import. Load `preview.tsx` from the current slug so Make Live entries appear without a full reload.
- A GPU root of `height: 100%` inside a centered auto-height Live cell. `useGpu` never starts if `clientHeight` stays under 2px. LiveStage `.frame` already stretches. For a plaque, size type from the stage (`cqh`/`cqw` on the outer 100% wrapper) and size the black box from in-flow content; raise `createTextMask` `scale` so the raster fills the plaque, not 30% of it.
- Imports from `apps/web/src/app/` or `apps/web/src/lib/`. `@/gpu` is the only host import.
- ConfigurableShell in an idea.

## Review mode

When asked to review an existing GPU idea, walk the checklist and the shader rules, then report findings grouped as look, performance, host. Cite file paths with line numbers. Count texture taps per pixel and name the resolution-dependent work that runs per frame.

## Verify

1. `bun test` in `apps/web`, then `bun run typecheck`.
2. Headless first: a `/tmp` script that imports `vgpu/node` (Dawn), calls `gpu.gpu.createShaderModule({ code })` + `await module.getCompilationInfo()` for WGSL errors with line numbers, then renders to a `target` and reads pixels. Run it with sandboxing off; the sandbox blocks Metal and Dawn reports "No WebGPU adapter". Delete the script afterwards.
3. Start both servers with `bun run dev` at the repo root (web `:3000`, api `:3001`); the idea list is empty without the api.
4. Open `/experimental` in the Cursor browser. It usually initialises WebGPU; if the canvas stays blank for 10s (`requestAdapter` hang), use Chrome or Safari instead.
5. Inspect edges at pixel level with CDP `Page.captureScreenshot` using `clip` and `scale: 2`, decode the base64 to a PNG and read it. Full-page screenshots hide fringe and grain detail.
6. Exercise pointer effects without a mouse: `canvas.dispatchEvent(new PointerEvent("pointermove", { clientX, clientY, pointerId: 1, pointerType: "mouse", bubbles: true }))` in a 16ms loop, then screenshot the region around the final position.
7. Resize the window, scroll the idea off screen (loop should stop), toggle reduced motion.
8. After Make Live, open the Live slug. Confirm the GPU canvas `clientHeight` is at least 2 and the idea is visible (not an empty stage with a sidebar entry).

## Worked example

`apps/web/src/experimental/ideas/LightDispersion/source.tsx` follows this skill (text mask + blur chain + pointer-driven distortion). Read it for the wiring; do not copy its effect.
