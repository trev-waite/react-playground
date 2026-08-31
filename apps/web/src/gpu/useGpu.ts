import { useEffect, useRef, useState, type RefObject } from "react";
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

export function useGpu(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  options: {
    label: string;
    alphaMode?: GPUCanvasAlphaMode;
    clearColor?: readonly [number, number, number, number];
    start: (session: GpuSession) => (() => void) | void;
  },
): { status: GpuStatus; error: string | null } {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const [status, setStatus] = useState<GpuStatus>(() =>
    webGpuSupported() ? "idle" : "unsupported",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!webGpuSupported()) {
      setStatus("unsupported");
      setError("WebGPU is not available in this browser");
      return;
    }

    const abort = new AbortController();
    let epoch = 0;
    let sessionCleanup = () => {};
    let gpu: GpuClient | undefined;

    const disposeSession = () => {
      sessionCleanup();
      sessionCleanup = () => {};
      gpu?.dispose();
      gpu = undefined;
    };

    const startSession = async () => {
      const mine = ++epoch;
      try {
        await waitForLayout(canvas, abort.signal);
        if (mine !== epoch || abort.signal.aborted) return;

        const created = await Promise.race([
          init({
            powerPreference: "high-performance",
            label: optionsRef.current.label,
          }),
          initTimeout(optionsRef.current.label),
        ]);
        if (mine !== epoch || abort.signal.aborted) {
          created.dispose();
          return;
        }

        gpu = created;
        const gpuSurface = surface(gpu, canvas, {
          alphaMode: optionsRef.current.alphaMode ?? "premultiplied",
          clearColor: optionsRef.current.clearColor ?? TRANSPARENT,
          dpr: GPU_DPR_RANGE,
          label: optionsRef.current.label,
        });
        sessionCleanup = optionsRef.current.start({ gpu, surface: gpuSurface, canvas }) ?? (() => {});
        if (mine !== epoch || abort.signal.aborted) {
          disposeSession();
          return;
        }
        setStatus("running");
        setError(null);
      } catch (caught) {
        if (mine !== epoch || abort.signal.aborted) return;
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
        if (!gpu) void startSession();
        return;
      }
      epoch += 1;
      disposeSession();
      setStatus("idle");
    };

    syncHost();

    const layer = canvas.closest("[data-layer]");
    let mutation: MutationObserver | undefined;
    if (layer instanceof HTMLElement) {
      mutation = new MutationObserver(syncHost);
      mutation.observe(layer, {
        attributes: true,
        attributeFilter: ["inert", "aria-hidden"],
      });
    }

    return () => {
      abort.abort();
      mutation?.disconnect();
      epoch += 1;
      disposeSession();
    };
  }, [canvasRef, options.label]);

  return { status, error };
}
