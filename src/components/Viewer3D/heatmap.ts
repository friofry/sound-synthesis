const TURBO_STOPS: Array<{ t: number; rgb: [number, number, number] }> = [
  { t: 0, rgb: [0.19, 0.07, 0.23] },
  { t: 0.13, rgb: [0.27, 0.26, 0.71] },
  { t: 0.25, rgb: [0.2, 0.52, 0.95] },
  { t: 0.38, rgb: [0.14, 0.75, 0.69] },
  { t: 0.5, rgb: [0.44, 0.87, 0.33] },
  { t: 0.63, rgb: [0.8, 0.88, 0.19] },
  { t: 0.75, rgb: [0.98, 0.73, 0.16] },
  { t: 0.88, rgb: [0.91, 0.38, 0.11] },
  { t: 1, rgb: [0.57, 0.05, 0.03] },
];

export type HeatmapRange = {
  min: number;
  max: number;
};

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function normalizeByRange(value: number, range: HeatmapRange): number {
  const span = range.max - range.min;
  if (!Number.isFinite(value) || !Number.isFinite(span) || span <= 1e-12) {
    return 0.5;
  }
  return clamp01((value - range.min) / span);
}

export function computeRange(values: number[]): HeatmapRange {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!Number.isFinite(value)) {
      continue;
    }
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 1 };
  }
  if (Math.abs(max - min) <= 1e-12) {
    return { min, max: min + 1 };
  }
  return { min, max };
}

export function heatmapColor(t: number): [number, number, number] {
  const safeT = clamp01(t);

  for (let index = 1; index < TURBO_STOPS.length; index += 1) {
    const prev = TURBO_STOPS[index - 1];
    const next = TURBO_STOPS[index];
    if (safeT > next.t) {
      continue;
    }
    const localSpan = Math.max(1e-9, next.t - prev.t);
    const localT = (safeT - prev.t) / localSpan;
    return [
      prev.rgb[0] + (next.rgb[0] - prev.rgb[0]) * localT,
      prev.rgb[1] + (next.rgb[1] - prev.rgb[1]) * localT,
      prev.rgb[2] + (next.rgb[2] - prev.rgb[2]) * localT,
    ];
  }

  return TURBO_STOPS[TURBO_STOPS.length - 1].rgb;
}
