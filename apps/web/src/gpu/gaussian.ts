export type BilinearTap = {
  /** Distance from the centre in source texels. Sample at `uv + offset` and `uv - offset`. */
  offset: number;
  weight: number;
};

/** Normalised 1D gaussian for `-radius..radius`. */
export function gaussianKernel(radius: number, sigma = radius / 2): number[] {
  if (!Number.isInteger(radius) || radius < 0) throw new RangeError("radius must be a non-negative integer");
  const s = Math.max(sigma, 1e-6);
  const weights: number[] = [];
  let total = 0;
  for (let i = -radius; i <= radius; i++) {
    const w = Math.exp(-(i * i) / (2 * s * s));
    weights.push(w);
    total += w;
  }
  return weights.map(w => w / total);
}

/**
 * Collapses a symmetric odd-length kernel into bilinear taps: the centre plus one tap per adjacent
 * pair on each side. `center + 2 * sum(weights)` is 1. A radius-4 kernel becomes 5 texture reads.
 */
export function bilinearGaussianTaps(radius: number, sigma?: number): { center: number; taps: BilinearTap[] } {
  const kernel = gaussianKernel(radius, sigma);
  const center = kernel[radius] ?? 1;
  const taps: BilinearTap[] = [];
  for (let i = 1; i <= radius; i += 2) {
    const a = kernel[radius + i] ?? 0;
    const b = kernel[radius + i + 1] ?? 0;
    const weight = a + b;
    if (weight <= 0) continue;
    taps.push({ offset: (i * a + (i + 1) * b) / weight, weight });
  }
  return { center, taps };
}
