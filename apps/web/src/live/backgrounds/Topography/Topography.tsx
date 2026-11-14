import { useRef } from "react";
import { clock, effect, sampler, target, type Frame } from "vgpu";
import { pausableLoop, useGpu, type GpuSession, type PausableLoop } from "@/gpu";
import { HEIGHT_SHADER, RELIEF_SHADER } from "./relief";
import { HEIGHTMAP_SCALE } from "./terraces";
import styles from "./Topography.module.css";

/** How fast the pointer's hill follows it, and how fast it rises and settles, per second. */
const FOLLOW_RATE = 6;
const RISE_RATE = 3.2;

function startRelief({ gpu, surface, canvas }: GpuSession) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const time = clock(gpu);
  const heightMap = target(gpu, { size: [1, 1], format: "rgba16float", label: "Topography heightmap" });
  const smooth = sampler(gpu, {
    minFilter: "linear",
    magFilter: "linear",
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
  });
  const params = { resolution: [1, 1], pointer: [0.5, 0.5], time: 0, pointerStrength: 0 };
  const height = effect(gpu, HEIGHT_SHADER, { label: "Topography height", set: { params } });
  const relief = effect(gpu, RELIEF_SHADER, {
    label: "Topography relief",
    set: { heightMap, heightSampler: smooth, params },
  });

  const pointer = { x: 0.5, y: 0.5, targetX: 0.5, targetY: 0.5, strength: 0, live: false };
  let pendingSize: [number, number] | null = null;
  /**
   * The loop runs while the map moves. A still map (reduced motion) draws one
   * frame and stops; a resize or a change of preference starts it again.
   */
  let loop: PausableLoop | null = null;
  const run = () => {
    loop ??= pausableLoop(gpu, canvas, draw);
  };
  reducedMotion.addEventListener("change", run);
  const resizeObserver = new ResizeObserver(run);
  resizeObserver.observe(canvas);
  let size: [number, number] = [1, 1];
  const unsubscribeResize = surface.onResize(({ width, height: tall }) => {
    pendingSize = [width, tall];
  });

  const host = canvas.parentElement ?? canvas;
  const onPointerMove = (event: PointerEvent) => {
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width < 1) return;
    pointer.targetX = (event.clientX - bounds.left) / bounds.width;
    pointer.targetY = (event.clientY - bounds.top) / bounds.height;
    if (!pointer.live && pointer.strength < 0.02) {
      pointer.x = pointer.targetX;
      pointer.y = pointer.targetY;
    }
    pointer.live = true;
  };
  const onPointerLeave = () => {
    pointer.live = false;
  };
  const onPointerUp = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") pointer.live = false;
  };
  host.addEventListener("pointermove", onPointerMove);
  host.addEventListener("pointerdown", onPointerMove);
  host.addEventListener("pointerup", onPointerUp);
  host.addEventListener("pointerleave", onPointerLeave);
  host.addEventListener("pointercancel", onPointerLeave);

  function draw(frame: Frame) {
    if (pendingSize) {
      size = pendingSize;
      pendingSize = null;
      heightMap.resize([
        Math.max(1, Math.round(size[0] * HEIGHTMAP_SCALE)),
        Math.max(1, Math.round(size[1] * HEIGHTMAP_SCALE)),
      ]);
    }
    const still = reducedMotion.matches;
    const dt = Math.min(time.deltaTime, 0.05);
    const follow = 1 - Math.exp(-dt * FOLLOW_RATE);
    pointer.x += (pointer.targetX - pointer.x) * follow;
    pointer.y += (pointer.targetY - pointer.y) * follow;
    pointer.strength = still ? 0 : pointer.strength + ((pointer.live ? 1 : 0) - pointer.strength) * (1 - Math.exp(-dt * RISE_RATE));
    const now = { resolution: size, pointer: [pointer.x, pointer.y], time: still ? 0 : time.time, pointerStrength: pointer.strength };
    height.set({ params: now });
    relief.set({ params: now });
    frame.pass(heightMap, height);
    frame.pass(surface, relief);
    if (still) {
      loop?.stop();
      loop = null;
    }
  }
  run();

  return () => {
    loop?.stop();
    unsubscribeResize();
    resizeObserver.disconnect();
    reducedMotion.removeEventListener("change", run);
    host.removeEventListener("pointermove", onPointerMove);
    host.removeEventListener("pointerdown", onPointerMove);
    host.removeEventListener("pointerup", onPointerUp);
    host.removeEventListener("pointerleave", onPointerLeave);
    host.removeEventListener("pointercancel", onPointerLeave);
    if ("destroy" in heightMap && typeof heightMap.destroy === "function") heightMap.destroy();
  };
}

/**
 * A terraced relief map for behind a page: contour layers stacked like cut
 * paper, drifting slowly, each casting a soft shadow on the one below. The
 * ground rises into a hill under the pointer.
 */
export function Topography() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useGpu(canvasRef, { label: "Topography", start: startRelief, clearColor: [0.965, 0.967, 0.97, 1] });

  return (
    <div className={styles.field}>
      <canvas ref={canvasRef} className={styles.map} aria-hidden="true" />
    </div>
  );
}
