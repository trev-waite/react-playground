export type HostLayerState = {
  inert: boolean;
  ariaHidden: string | null;
};

export const GPU_DPR_RANGE = [1, 2] as const;

export function webGpuSupported(): boolean {
  return typeof navigator !== "undefined" && navigator.gpu != null;
}

export function physicalCanvasSize(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
  dprCap = GPU_DPR_RANGE[1],
): [number, number] {
  const dpr = Math.min(dprCap, Math.max(GPU_DPR_RANGE[0], devicePixelRatio || 1));
  return [
    Math.max(1, Math.round(cssWidth * dpr)),
    Math.max(1, Math.round(cssHeight * dpr)),
  ];
}

export function canvasHasLayout(canvas: HTMLCanvasElement): boolean {
  return canvas.clientWidth >= 2 && canvas.clientHeight >= 2;
}

export function isLayerRenderable(layer: HostLayerState | null): boolean {
  if (!layer) return true;
  if (layer.inert) return false;
  if (layer.ariaHidden === "true") return false;
  return true;
}

export function readHostLayer(element: Element): HostLayerState | null {
  const layer = element.closest("[data-layer]");
  if (!(layer instanceof HTMLElement)) return null;
  return {
    inert: layer.inert,
    ariaHidden: layer.getAttribute("aria-hidden"),
  };
}

export function gpuHostIsActive(element: Element): boolean {
  return isLayerRenderable(readHostLayer(element));
}
