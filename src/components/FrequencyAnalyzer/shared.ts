export const MIN_FREQUENCY = 20;
export const MAX_FREQUENCY = 16000;
export const FALLBACK_MIN_DB = -96;
export const FALLBACK_MAX_DB = -12;
export const LABEL_FREQUENCIES = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 16000];

export type CanvasLayout = {
  cssWidth: number;
  cssHeight: number;
  chartLeft: number;
  chartTop: number;
  chartRight: number;
  chartBottom: number;
  chartWidth: number;
  chartHeight: number;
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Largest power of two not exceeding n (0 if n < 1). Used to cap FFT to buffer length. */
export function largestPowerOfTwoAtMost(n: number): number {
  if (!Number.isFinite(n) || n < 1) {
    return 0;
  }
  return 2 ** Math.floor(Math.log2(n));
}

export function formatFrequencyLabel(frequency: number): string {
  if (frequency >= 1000) {
    return `${(frequency / 1000).toFixed(frequency >= 10000 ? 0 : 1)}k`;
  }
  return `${Math.round(frequency)}`;
}

export function formatTimeLabel(seconds: number): string {
  if (seconds < 1) {
    return `${seconds.toFixed(2)} s`;
  }
  if (seconds < 10) {
    return `${seconds.toFixed(1)} s`;
  }
  return `${seconds.toFixed(0)} s`;
}

export function dbToSpectrogramColor(normalized: number): string {
  const t = clamp(normalized, 0, 1);
  if (t < 0.2) {
    const s = t / 0.2;
    return `rgb(${Math.round(16 + s * 24)}, ${Math.round(4 + s * 20)}, ${Math.round(48 + s * 96)})`;
  }
  if (t < 0.4) {
    const s = (t - 0.2) / 0.2;
    return `rgb(${Math.round(40 + s * 32)}, ${Math.round(24 + s * 48)}, ${Math.round(144 + s * 64)})`;
  }
  if (t < 0.6) {
    const s = (t - 0.4) / 0.2;
    return `rgb(${Math.round(72 + s * 100)}, ${Math.round(72 + s * 48)}, ${Math.round(208 - s * 80)})`;
  }
  if (t < 0.8) {
    const s = (t - 0.6) / 0.2;
    return `rgb(${Math.round(172 + s * 68)}, ${Math.round(120 + s * 64)}, ${Math.round(128 - s * 80)})`;
  }
  const s = (t - 0.8) / 0.2;
  return `rgb(255, ${Math.round(184 + s * 60)}, ${Math.round(48 + s * 64)})`;
}

export function getLogFrequencyRatio(frequency: number, minFrequency: number, maxFrequency: number): number {
  const safeMin = Math.max(1e-6, minFrequency);
  const safeMax = Math.max(safeMin + 1e-6, maxFrequency);
  return (Math.log(frequency) - Math.log(safeMin)) / (Math.log(safeMax) - Math.log(safeMin));
}

export function resizeCanvas(
  canvas: HTMLCanvasElement,
  chartInsets = { left: 52, top: 20, right: 18, bottom: 28 },
): { ctx: CanvasRenderingContext2D; layout: CanvasLayout } | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = Math.max(1, Math.floor(rect.width));
  const cssHeight = Math.max(1, Math.floor(rect.height));
  const pixelWidth = Math.floor(cssWidth * dpr);
  const pixelHeight = Math.floor(cssHeight * dpr);

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const chartLeft = chartInsets.left;
  const chartTop = chartInsets.top;
  const chartRight = cssWidth - chartInsets.right;
  const chartBottom = cssHeight - chartInsets.bottom;
  const layout: CanvasLayout = {
    cssWidth,
    cssHeight,
    chartLeft,
    chartTop,
    chartRight,
    chartBottom,
    chartWidth: Math.max(1, chartRight - chartLeft),
    chartHeight: Math.max(1, chartBottom - chartTop),
  };

  return { ctx, layout };
}
