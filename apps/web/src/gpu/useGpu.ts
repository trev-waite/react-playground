import { useEffect, useEffectEvent, useState, type RefObject } from "react";
import { init, surface, type Surface } from "vgpu";
import { keepGpuAwake } from "./keepAwake";
import {
  canvasHasLayout,
  GPU_DPR_RANGE,
  gpuHostIsActive,
  webGpuSupported,
} from "./host";

type GpuClient = Awaited<ReturnType<typeof init>>;

export type GpuSession = {
  gpu: GpuClient;
  surface: Surface;
  canvas: HTMLCanvasElement;
};

export type GpuStatus = "idle" | "running" | "unsupported" | "error";

const OFFSCREEN_GRACE_MS = 1500;
const PROXIMITY = { rootMargin: "300px 0px", scrollMargin: "300px 0px" };
const INIT_TIMEOUT_MS = 10_000;
/** vgpu clears to opaque black; experiments keep the canvas see-through for HTML underlays. */
const TRANSPARENT: readonly [number, number, number, number] = [0, 0, 0, 0];

function waitForLayout(canvas: HTMLCanvasElement, signal: AbortSignal) {
  // vgpu sizes from clientWidth/clientHeight. A 0x0 first frame stays blank.
  if (canvasHasLayout(canvas)) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      observer.disconnect();
      signal.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve();
    };
    const onAbort = () => finish(new DOMException("Aborted", "AbortError"));
    const observer = new ResizeObserver(() => {
      if (canvasHasLayout(canvas)) finish();
    });
    observer.observe(canvas);
    signal.addEventListener("abort", onAbort);
  });
}

async function initClient(label: string, features: readonly GPUFeatureName[]): Promise<GpuClient> {
  const create = (requiredFeatures: readonly GPUFeatureName[]) => new Promise<GpuClient>((resolve, reject) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      reject(new Error(`${label}: WebGPU init timed out`));
    }, INIT_TIMEOUT_MS);
    init({ powerPreference: "high-performance", label, requiredFeatures }).then(gpu => {
      clearTimeout(timer);
      if (timedOut) gpu.dispose();
      else resolve(gpu);
    }, error => {
      clearTimeout(timer);
      reject(error);
    });
  });
  if (features.length === 0) return create([]);
  try {
    return await create(features);
  } catch (caught) {
    // Optional features (timestamp-query for timers) are nice-to-have; run without them.
    console.warn(`${label}: WebGPU features unavailable, retrying without ${features.join(", ")}`, caught);
    return create([]);
  }
}

export type UseGpuOptions = {
  label: string;
  alphaMode?: GPUCanvasAlphaMode;
  clearColor?: readonly [number, number, number, number];
  /** Device pixel ratio clamp. Defaults to `GPU_DPR_RANGE`; heavy effects can pass `[1, 1.5]`. */
  dpr?: readonly [number, number];
  /** Optional device features. Init falls back to none if the adapter lacks them. */
  features?: readonly GPUFeatureName[];
  start: (session: GpuSession) => (() => void) | void;
};

/** Starts WebGPU on `canvas` while its layer is active, and stops it when the layer hides or the returned cleanup runs. */
function runGpu(
  canvas: HTMLCanvasElement,
  readOptions: () => UseGpuOptions,
  setStatus: (status: GpuStatus) => void,
  setError: (error: string | null) => void,
): () => void {
  let attempt: AbortController | undefined;
  let releaseTimer: ReturnType<typeof setTimeout> | undefined;
  let nearby = false;
  const session: { cleanup: () => void; rest: () => void; gpu?: GpuClient } = {
    cleanup: () => {},
    rest: () => {},
  };

  const disposeSession = () => {
    attempt?.abort();
    attempt = undefined;
    session.cleanup();
    session.cleanup = () => {};
    session.rest();
    session.rest = () => {};
    session.gpu?.dispose();
    delete session.gpu;
  };

  const startSession = async (signal: AbortSignal) => {
    try {
      await waitForLayout(canvas, signal);
      if (signal.aborted) return;
      const gpu = await initClient(readOptions().label, readOptions().features ?? []);
      if (signal.aborted) {
        gpu.dispose();
        return;
      }

      session.gpu = gpu;
      session.rest = keepGpuAwake(gpu.gpu);
      const gpuSurface = surface(gpu, canvas, {
        alphaMode: readOptions().alphaMode ?? "premultiplied",
        clearColor: readOptions().clearColor ?? TRANSPARENT,
        dpr: readOptions().dpr ?? GPU_DPR_RANGE,
        label: readOptions().label,
      });
      session.cleanup = readOptions().start({ gpu, surface: gpuSurface, canvas }) ?? (() => {});
      setStatus("running");
      setError(null);
    } catch (caught) {
      if (signal.aborted) return;
      const message =
        caught instanceof Error ? caught.message : "WebGPU failed to start";
      console.error(message, caught);
      setStatus("error");
      setError(message);
      disposeSession();
    }
  };

  const release = () => {
    releaseTimer = undefined;
    disposeSession();
    setStatus("idle");
  };

  const syncHost = () => {
    if (!gpuHostIsActive(canvas) || document.hidden) {
      clearTimeout(releaseTimer);
      release();
    } else if (nearby) {
      clearTimeout(releaseTimer);
      releaseTimer = undefined;
      if (!attempt) {
        attempt = new AbortController();
        void startSession(attempt.signal);
      }
    } else if (attempt && releaseTimer === undefined) {
      releaseTimer = setTimeout(release, OFFSCREEN_GRACE_MS);
    }
  };

  const proximity = new IntersectionObserver(entries => {
    nearby = entries[entries.length - 1]?.isIntersecting ?? false;
    syncHost();
  }, PROXIMITY);
  proximity.observe(canvas);
  document.addEventListener("visibilitychange", syncHost);

  const layer = canvas.closest("[data-layer]");
  const mutation = layer instanceof HTMLElement ? new MutationObserver(syncHost) : undefined;
  if (mutation && layer) {
    mutation.observe(layer, {
      attributes: true,
      attributeFilter: ["inert", "aria-hidden"],
    });
  }

  return () => {
    clearTimeout(releaseTimer);
    proximity.disconnect();
    document.removeEventListener("visibilitychange", syncHost);
    mutation?.disconnect();
    disposeSession();
  };
}

export function useGpu(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  options: UseGpuOptions,
): { status: GpuStatus; error: string | null } {
  const readOptions = useEffectEvent(() => options);
  const [status, setStatus] = useState<GpuStatus>(() =>
    webGpuSupported() ? "idle" : "unsupported",
  );
  const [error, setError] = useState<string | null>(() =>
    webGpuSupported() ? null : "WebGPU is not available in this browser",
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !webGpuSupported()) return;
    return runGpu(canvas, readOptions, setStatus, setError);
  }, [canvasRef, options.label]);

  return { status, error };
}
