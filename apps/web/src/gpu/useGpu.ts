import { useEffect, useEffectEvent, useState, type RefObject } from "react";
import { init, surface, type Surface } from "vgpu";
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

const INIT_TIMEOUT_MS = 10_000;
/** vgpu clears to opaque black; experiments keep the canvas see-through for HTML underlays. */
const TRANSPARENT: readonly [number, number, number, number] = [0, 0, 0, 0];

function initTimeout(label: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`${label}: WebGPU init timed out`));
    }, INIT_TIMEOUT_MS);
  });
}

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
  const create = (requiredFeatures: readonly GPUFeatureName[]) =>
    Promise.race([
      init({ powerPreference: "high-performance", label, requiredFeatures }),
      initTimeout(label),
    ]);
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
  const abort = new AbortController();
  const session: { epoch: number; cleanup: () => void; gpu: GpuClient | undefined } = {
    epoch: 0,
    cleanup: () => {},
    gpu: undefined,
  };

  const disposeSession = () => {
    session.cleanup();
    session.cleanup = () => {};
    session.gpu?.dispose();
    session.gpu = undefined;
  };

  const startSession = async () => {
    session.epoch += 1;
    const mine = session.epoch;
    try {
      await waitForLayout(canvas, abort.signal);
      if (mine !== session.epoch || abort.signal.aborted) return;

      const created = await initClient(readOptions().label, readOptions().features ?? []);
      if (mine !== session.epoch || abort.signal.aborted) {
        created.dispose();
        return;
      }

      const gpu = created;
      session.gpu = gpu;
      const gpuSurface = surface(gpu, canvas, {
        alphaMode: readOptions().alphaMode ?? "premultiplied",
        clearColor: readOptions().clearColor ?? TRANSPARENT,
        dpr: readOptions().dpr ?? GPU_DPR_RANGE,
        label: readOptions().label,
      });
      session.cleanup = readOptions().start({ gpu, surface: gpuSurface, canvas }) ?? (() => {});
      if (mine !== session.epoch || abort.signal.aborted) {
        disposeSession();
        return;
      }
      setStatus("running");
      setError(null);
    } catch (caught) {
      if (mine !== session.epoch || abort.signal.aborted) return;
      const message =
        caught instanceof Error ? caught.message : "WebGPU failed to start";
      console.error(message, caught);
      setStatus("error");
      setError(message);
      disposeSession();
    }
  };

  const syncHost = () => {
    if (abort.signal.aborted) return;
    // Experimental stays mounted under Live as an inert layer. Drop the adapter while hidden.
    if (gpuHostIsActive(canvas)) {
      if (!session.gpu) void startSession();
      return;
    }
    session.epoch += 1;
    disposeSession();
    setStatus("idle");
  };

  syncHost();

  const layer = canvas.closest("[data-layer]");
  const mutation = layer instanceof HTMLElement ? new MutationObserver(syncHost) : undefined;
  if (mutation && layer) {
    mutation.observe(layer, {
      attributes: true,
      attributeFilter: ["inert", "aria-hidden"],
    });
  }

  return () => {
    abort.abort();
    mutation?.disconnect();
    session.epoch += 1;
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
