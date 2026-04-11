import { clamp, formatFrequencyLabel, getLogFrequencyRatio, MIN_FREQUENCY } from "./shared";
import {
  findDominantFrequencyLinearMagnitudesWasm,
  findDominantFrequencySpectrumPointsWasm,
  isPitchAnalysisWasmLoaded,
} from "./pitchAnalysisWasm";

export const A4_HZ = 440;
const A_WEIGHTING_FLOOR_HZ = 10;

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** 12-TET: MIDI note number (float) for a frequency. */
export function frequencyToMidi(frequencyHz: number, a4Hz = A4_HZ): number {
  if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) {
    return NaN;
  }
  return 12 * Math.log2(frequencyHz / a4Hz) + 69;
}

export function midiToFrequency(midi: number, a4Hz = A4_HZ): number {
  return a4Hz * 2 ** ((midi - 69) / 12);
}

export function formatScientificPitchName(midi: number): string {
  const rounded = Math.round(midi);
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${name}${octave}`;
}

export function formatHzDetailed(hz: number): string {
  if (!Number.isFinite(hz) || hz <= 0) {
    return "";
  }
  if (hz >= 1000) {
    return `${hz.toFixed(hz >= 10000 ? 0 : 1)} Hz`;
  }
  return `${hz.toFixed(1)} Hz`;
}

/**
 * Reference JS implementation (parity tests / benchmarks). Prefer `findDominantFrequencySpectrumPoints`
 * in app code — it uses WASM when available (faster than JS in typical builds).
 */
export function findDominantFrequencySpectrumPointsJs(
  points: { frequency: number; magnitude: number }[],
  minHz: number,
  maxHz: number,
): number | null {
  if (points.length < 3) {
    return null;
  }
  const mags = new Float64Array(points.length);
  for (let i = 0; i < points.length; i += 1) {
    mags[i] = points[i].magnitude;
  }

  const hps = harmonicProductSpectrum(mags, HPS_HARMONICS);
  const binToHz = (i: number) => points[i].frequency;
  const { bestIndex } = findHpsPeak(hps, binToHz, minHz, maxHz);

  if (bestIndex < 0) {
    return null;
  }
  if (bestIndex < 1 || bestIndex >= points.length - 1) {
    return points[bestIndex].frequency;
  }
  const offset = parabolicPeakOffset(hps[bestIndex - 1], hps[bestIndex], hps[bestIndex + 1]);
  const iFloat = bestIndex + offset;
  const i0 = clamp(Math.floor(iFloat), 0, points.length - 1);
  const i1 = clamp(Math.ceil(iFloat), 0, points.length - 1);
  const t = iFloat - i0;
  const f0 = points[i0].frequency;
  const f1 = points[i1].frequency;
  const hz = f0 * (1 - t) + f1 * t;
  return Number.isFinite(hz) ? hz : points[bestIndex].frequency;
}

export function findDominantFrequencySpectrumPoints(
  points: { frequency: number; magnitude: number }[],
  minHz: number,
  maxHz: number,
): number | null {
  if (isPitchAnalysisWasmLoaded()) {
    return findDominantFrequencySpectrumPointsWasm(points, minHz, maxHz);
  }
  return findDominantFrequencySpectrumPointsJs(points, minHz, maxHz);
}

function aWeightingLinearGain(frequencyHz: number): number {
  if (!Number.isFinite(frequencyHz) || frequencyHz <= A_WEIGHTING_FLOOR_HZ) {
    return 0;
  }
  const f2 = frequencyHz * frequencyHz;
  const numerator = (12200 ** 2) * (f2 ** 2);
  const denominator =
    (f2 + 20.6 ** 2) *
    Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) *
    (f2 + 12200 ** 2);
  if (!Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }
  const ra = numerator / denominator;
  if (!Number.isFinite(ra) || ra <= 0) {
    return 0;
  }
  const aDb = 20 * Math.log10(ra) + 2;
  return 10 ** (aDb / 20);
}

function findWeightedLocalPeakHz(
  weighted: Float64Array,
  rawBinValues: Float64Array,
  binToHz: (bin: number) => number,
  minHz: number,
  maxHz: number,
): number | null {
  if (weighted.length < 3 || rawBinValues.length !== weighted.length) {
    return null;
  }
  let bestIndex = -1;
  let bestValue = -1;
  for (let i = 1; i < weighted.length - 1; i += 1) {
    const hz = binToHz(i);
    if (hz < minHz || hz > maxHz) {
      continue;
    }
    const center = weighted[i];
    if (center <= 0) {
      continue;
    }
    if (center < weighted[i - 1] || center < weighted[i + 1]) {
      continue;
    }
    if (center > bestValue) {
      bestValue = center;
      bestIndex = i;
    }
  }
  if (bestIndex < 0) {
    return null;
  }
  if (bestIndex < 1 || bestIndex >= weighted.length - 1) {
    return binToHz(bestIndex);
  }
  const offset = parabolicPeakOffset(
    rawBinValues[bestIndex - 1],
    rawBinValues[bestIndex],
    rawBinValues[bestIndex + 1],
  );
  const iFloat = bestIndex + offset;
  const i0 = clamp(Math.floor(iFloat), 0, weighted.length - 1);
  const i1 = clamp(Math.ceil(iFloat), 0, weighted.length - 1);
  const t = iFloat - i0;
  const f0 = binToHz(i0);
  const f1 = binToHz(i1);
  const hz = f0 * (1 - t) + f1 * t;
  const fallback = binToHz(bestIndex);
  return Number.isFinite(hz) && hz >= minHz && hz <= maxHz ? hz : fallback;
}

export function findProminentFrequencySpectrumPoints(
  points: { frequency: number; magnitude: number }[],
  minHz: number,
  maxHz: number,
): number | null {
  if (points.length < 3) {
    return null;
  }
  const raw = new Float64Array(points.length);
  const weighted = new Float64Array(points.length);
  for (let i = 0; i < points.length; i += 1) {
    const magnitude = Math.max(0, points[i].magnitude ?? 0);
    const gain = aWeightingLinearGain(points[i].frequency);
    raw[i] = magnitude;
    weighted[i] = magnitude * gain;
  }
  return findWeightedLocalPeakHz(weighted, raw, (i) => points[i].frequency, minHz, maxHz);
}

function parabolicPeakOffset(yPrev: number, yPeak: number, yNext: number): number {
  const denom = yPrev - 2 * yPeak + yNext;
  if (!Number.isFinite(denom) || Math.abs(denom) < 1e-18) {
    return 0;
  }
  return clamp(0.5 * (yPrev - yNext) / denom, -1, 1);
}

/**
 * Harmonic Product Spectrum: multiply the magnitude spectrum at 1×, 2×, 3×… downsampling rates.
 * The true fundamental accumulates energy from all its harmonics, so it dominates the product.
 */
function harmonicProductSpectrum(
  magnitudes: Float64Array | number[],
  harmonicCount: number,
): Float64Array {
  const N = typeof magnitudes === "object" && "length" in magnitudes ? magnitudes.length : 0;
  const hps = new Float64Array(N);
  for (let i = 0; i < N; i += 1) {
    hps[i] = magnitudes[i] ?? 0;
  }
  for (let h = 2; h <= harmonicCount; h += 1) {
    const limit = Math.floor(N / h);
    for (let i = 0; i < limit; i += 1) {
      hps[i] *= magnitudes[i * h] ?? 0;
    }
    for (let i = limit; i < N; i += 1) {
      hps[i] = 0;
    }
  }
  return hps;
}

function findHpsPeak(
  hps: Float64Array,
  binToHz: (bin: number) => number,
  minHz: number,
  maxHz: number,
): { bestIndex: number; bestValue: number } {
  let bestIndex = -1;
  let bestValue = -1;
  for (let i = 1; i < hps.length - 1; i += 1) {
    const hz = binToHz(i);
    if (hz < minHz || hz > maxHz) {
      continue;
    }
    if (hps[i] > bestValue) {
      bestValue = hps[i];
      bestIndex = i;
    }
  }
  return { bestIndex, bestValue };
}

const HPS_HARMONICS = 5;

/** Peak frequency from AnalyserNode `getFloatFrequencyData` (dBFS per bin). Stays on JS — WASM is slower here (memcpy + exp). */
export function findDominantFrequencyDecibelsJs(
  data: Float32Array,
  sampleRate: number,
  minHz: number,
  maxHz: number,
): number | null {
  if (data.length < 3 || sampleRate <= 0) {
    return null;
  }
  const nyquist = sampleRate / 2;
  const minDb = -120;

  const linear = new Float64Array(data.length);
  for (let i = 0; i < data.length; i += 1) {
    const db = data[i] ?? minDb;
    linear[i] = Math.max(0, 10 ** (db / 20));
  }

  const hps = harmonicProductSpectrum(linear, HPS_HARMONICS);
  const binToHz = (bin: number) => (bin / data.length) * nyquist;

  const { bestIndex } = findHpsPeak(hps, binToHz, minHz, maxHz);
  if (bestIndex < 1 || bestIndex >= hps.length - 1) {
    return bestIndex >= 0 ? binToHz(bestIndex) : null;
  }

  const offset = parabolicPeakOffset(hps[bestIndex - 1], hps[bestIndex], hps[bestIndex + 1]);
  const hz = binToHz(bestIndex + offset);
  return Number.isFinite(hz) && hz >= minHz && hz <= maxHz ? hz : binToHz(bestIndex);
}

export const findDominantFrequencyDecibels = findDominantFrequencyDecibelsJs;

export function findProminentFrequencyDecibels(
  data: Float32Array,
  sampleRate: number,
  minHz: number,
  maxHz: number,
): number | null {
  if (data.length < 3 || sampleRate <= 0) {
    return null;
  }
  const nyquist = sampleRate / 2;
  const minDb = -120;
  const raw = new Float64Array(data.length);
  const weighted = new Float64Array(data.length);
  for (let i = 0; i < data.length; i += 1) {
    const db = data[i] ?? minDb;
    const magnitude = Math.max(0, 10 ** (db / 20));
    const hz = (i / data.length) * nyquist;
    const gain = aWeightingLinearGain(hz);
    raw[i] = magnitude;
    weighted[i] = magnitude * gain;
  }
  return findWeightedLocalPeakHz(weighted, raw, (bin) => (bin / data.length) * nyquist, minHz, maxHz);
}

/** Peak frequency from linear FFT magnitudes (one magnitude per bin k for FFT bin k+1). Reference JS — use `findDominantFrequencyLinearMagnitudes` in app code. */
export function findDominantFrequencyLinearMagnitudesJs(
  magnitudes: Float64Array,
  sampleRate: number,
  frameSize: number,
  minHz: number,
  maxHz: number,
): number | null {
  if (magnitudes.length < 3 || sampleRate <= 0 || frameSize <= 0) {
    return null;
  }

  const hps = harmonicProductSpectrum(magnitudes, HPS_HARMONICS);
  const binToHz = (i: number) => ((i + 1) * sampleRate) / frameSize;

  const { bestIndex } = findHpsPeak(hps, binToHz, minHz, maxHz);
  if (bestIndex < 1 || bestIndex >= hps.length - 1) {
    return bestIndex >= 0 ? binToHz(bestIndex) : null;
  }

  const offset = parabolicPeakOffset(hps[bestIndex - 1], hps[bestIndex], hps[bestIndex + 1]);
  const hz = binToHz(bestIndex + offset);
  return Number.isFinite(hz) && hz >= minHz && hz <= maxHz ? hz : binToHz(bestIndex);
}

export function findDominantFrequencyLinearMagnitudes(
  magnitudes: Float64Array,
  sampleRate: number,
  frameSize: number,
  minHz: number,
  maxHz: number,
): number | null {
  if (isPitchAnalysisWasmLoaded()) {
    return findDominantFrequencyLinearMagnitudesWasm(magnitudes, sampleRate, frameSize, minHz, maxHz);
  }
  return findDominantFrequencyLinearMagnitudesJs(magnitudes, sampleRate, frameSize, minHz, maxHz);
}

export function findProminentFrequencyLinearMagnitudes(
  magnitudes: Float64Array,
  sampleRate: number,
  frameSize: number,
  minHz: number,
  maxHz: number,
): number | null {
  if (magnitudes.length < 3 || sampleRate <= 0 || frameSize <= 0) {
    return null;
  }
  const raw = new Float64Array(magnitudes.length);
  const weighted = new Float64Array(magnitudes.length);
  for (let i = 0; i < magnitudes.length; i += 1) {
    const magnitude = Math.max(0, magnitudes[i] ?? 0);
    const hz = ((i + 1) * sampleRate) / frameSize;
    const gain = aWeightingLinearGain(hz);
    raw[i] = magnitude;
    weighted[i] = magnitude * gain;
  }
  return findWeightedLocalPeakHz(weighted, raw, (i) => ((i + 1) * sampleRate) / frameSize, minHz, maxHz);
}

/** Pick STFT frame with largest total energy. Stays on JS — WASM pays copy cost per call. */
export function pickLoudestStftFrameIndexJs(magnitudes: Float64Array[]): number {
  if (magnitudes.length === 0) {
    return 0;
  }
  let best = 0;
  let bestSum = -1;
  for (let frameIndex = 0; frameIndex < magnitudes.length; frameIndex += 1) {
    const frame = magnitudes[frameIndex];
    let sum = 0;
    for (let i = 0; i < frame.length; i += 1) {
      sum += frame[i] ?? 0;
    }
    if (sum > bestSum) {
      bestSum = sum;
      best = frameIndex;
    }
  }
  return best;
}

export const pickLoudestStftFrameIndex = pickLoudestStftFrameIndexJs;

export function getOvertoneFrequencies(fundamentalHz: number, maxHz: number): number[] {
  const list: number[] = [];
  for (let harmonic = 2; harmonic <= 32; harmonic += 1) {
    const f = fundamentalHz * harmonic;
    if (f > maxHz) {
      break;
    }
    list.push(f);
  }
  return list;
}

export type PitchOverlayTheme = "dark" | "light";

type PitchOverlayBase = {
  chartLeft: number;
  chartTop: number;
  chartRight: number;
  chartBottom: number;
  chartWidth: number;
  chartHeight: number;
  maxFrequency: number;
  fundamentalHz: number | null;
  prominentHz: number | null;
  highlightFundamental: boolean;
  highlightProminent: boolean;
  highlightOvertones: boolean;
  showNoteLabels: boolean;
};

function pitchOverlayColors(theme: PitchOverlayTheme) {
  if (theme === "dark") {
    return {
      fundamental: "rgba(255, 210, 96, 0.95)",
      prominent: "rgba(255, 130, 130, 0.95)",
      overtone: "rgba(120, 220, 255, 0.85)",
      note: "rgba(230, 230, 240, 0.88)",
      noteLine: "rgba(255, 255, 255, 0.06)",
    };
  }
  return {
    fundamental: "rgba(180, 60, 40, 0.95)",
    prominent: "rgba(20, 120, 80, 0.95)",
    overtone: "rgba(30, 100, 160, 0.9)",
    note: "rgba(20, 20, 20, 0.88)",
    noteLine: "rgba(0, 0, 0, 0.08)",
  };
}

/** Horizontal lines on spectrogram (frequency → y). */
export function drawSpectrogramPitchOverlay(
  ctx: CanvasRenderingContext2D,
  options: PitchOverlayBase & { theme: PitchOverlayTheme },
): void {
  const {
    chartLeft,
    chartTop,
    chartRight,
    chartBottom,
    chartWidth,
    chartHeight,
    maxFrequency,
    fundamentalHz,
    prominentHz,
    highlightFundamental,
    highlightProminent,
    highlightOvertones,
    showNoteLabels,
    theme,
  } = options;
  const colors = pitchOverlayColors(theme);
  const maxF = Math.max(MIN_FREQUENCY + 1e-6, maxFrequency);
  const minF = MIN_FREQUENCY;

  const yForFreq = (hz: number): number => {
    const ratio = getLogFrequencyRatio(hz, minF, maxF);
    return chartBottom - ratio * chartHeight;
  };

  if (showNoteLabels) {
    const minMidi = Math.ceil(frequencyToMidi(minF));
    const maxMidi = Math.floor(frequencyToMidi(maxF));
    let lastY = -Infinity;
    ctx.font = "9px Tahoma, Segoe UI, sans-serif";
    for (let midi = minMidi; midi <= maxMidi; midi += 1) {
      const hz = midiToFrequency(midi);
      if (hz < minF || hz > maxF) {
        continue;
      }
      const y = yForFreq(hz);
      if (y < chartTop - 2 || y > chartBottom + 2) {
        continue;
      }
      if (Math.abs(y - lastY) < 11) {
        continue;
      }
      lastY = y;
      ctx.strokeStyle = colors.noteLine;
      ctx.beginPath();
      ctx.moveTo(chartLeft, y + 0.5);
      ctx.lineTo(chartRight, y + 0.5);
      ctx.stroke();
      ctx.fillStyle = colors.note;
      ctx.fillText(formatScientificPitchName(midi), chartLeft + 4, y + 3);
    }
  }

  if (highlightFundamental && fundamentalHz && fundamentalHz > 0) {
    const y = yForFreq(fundamentalHz);
    if (y >= chartTop && y <= chartBottom) {
      ctx.strokeStyle = colors.fundamental;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(chartLeft, y + 0.5);
      ctx.lineTo(chartRight, y + 0.5);
      ctx.stroke();
      ctx.lineWidth = 1;
      const label = `${formatScientificPitchName(frequencyToMidi(fundamentalHz))} · ${formatHzDetailed(fundamentalHz)}`;
      ctx.font = "10px Tahoma, Segoe UI, sans-serif";
      ctx.fillStyle = colors.fundamental;
      ctx.fillText(label, chartRight - Math.min(220, chartWidth * 0.45), Math.max(chartTop + 12, y - 6));
    }
  }

  if (highlightProminent && prominentHz && prominentHz > 0) {
    const y = yForFreq(prominentHz);
    if (y >= chartTop && y <= chartBottom) {
      ctx.strokeStyle = colors.prominent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(chartLeft, y + 0.5);
      ctx.lineTo(chartRight, y + 0.5);
      ctx.stroke();
      ctx.lineWidth = 1;
      const label = `Prominent: ${formatScientificPitchName(frequencyToMidi(prominentHz))} · ${formatHzDetailed(prominentHz)}`;
      ctx.font = "10px Tahoma, Segoe UI, sans-serif";
      ctx.fillStyle = colors.prominent;
      ctx.fillText(
        label,
        chartRight - Math.min(260, chartWidth * 0.62),
        Math.min(chartBottom - 6, Math.max(chartTop + 24, y + 12)),
      );
    }
  }

  if (highlightOvertones && fundamentalHz && fundamentalHz > 0) {
    const overtoneFs = getOvertoneFrequencies(fundamentalHz, maxF);
    ctx.setLineDash([4, 3]);
    overtoneFs.forEach((hz, index) => {
      const y = yForFreq(hz);
      if (y < chartTop || y > chartBottom) {
        return;
      }
      ctx.strokeStyle = colors.overtone;
      ctx.beginPath();
      ctx.moveTo(chartLeft, y + 0.5);
      ctx.lineTo(chartRight, y + 0.5);
      ctx.stroke();
      ctx.font = "9px Tahoma, Segoe UI, sans-serif";
      ctx.fillStyle = colors.overtone;
      ctx.fillText(`${index + 2}× · ${formatFrequencyLabel(hz)} Hz`, chartLeft + 4, Math.min(chartBottom - 4, y + 3));
    });
    ctx.setLineDash([]);
  }
}

/** Vertical lines on frequency bars (frequency → x). */
export function drawBarsPitchOverlay(
  ctx: CanvasRenderingContext2D,
  options: PitchOverlayBase & { theme: PitchOverlayTheme; sampleRate: number; cssHeight: number },
): void {
  const {
    chartLeft,
    chartTop,
    chartBottom,
    chartWidth,
    cssHeight,
    maxFrequency,
    sampleRate,
    fundamentalHz,
    prominentHz,
    highlightFundamental,
    highlightProminent,
    highlightOvertones,
    showNoteLabels,
    theme,
  } = options;
  const colors = pitchOverlayColors(theme);
  const maxF = Math.min(maxFrequency, sampleRate / 2);
  const minF = MIN_FREQUENCY;
  const logMin = Math.log(minF);
  const logRange = Math.max(1e-9, Math.log(maxF) - logMin);

  const xForFreq = (hz: number): number => {
    return chartLeft + ((Math.log(hz) - logMin) / logRange) * chartWidth;
  };

  if (showNoteLabels) {
    const minMidi = Math.ceil(frequencyToMidi(minF));
    const maxMidi = Math.floor(frequencyToMidi(maxF));
    let lastX = -Infinity;
    ctx.font = "9px Tahoma, Segoe UI, sans-serif";
    for (let midi = minMidi; midi <= maxMidi; midi += 1) {
      const hz = midiToFrequency(midi);
      if (hz < minF || hz > maxF) {
        continue;
      }
      const x = xForFreq(hz);
      if (x < chartLeft - 2 || x > chartLeft + chartWidth + 2) {
        continue;
      }
      if (Math.abs(x - lastX) < 14) {
        continue;
      }
      lastX = x;
      ctx.strokeStyle = colors.noteLine;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, chartTop);
      ctx.lineTo(x + 0.5, chartBottom);
      ctx.stroke();
      ctx.fillStyle = colors.note;
      const text = formatScientificPitchName(midi);
      ctx.fillText(text, Math.max(chartLeft + 2, x - 10), cssHeight - 6);
    }
  }

  if (highlightFundamental && fundamentalHz && fundamentalHz > 0) {
    const x = xForFreq(fundamentalHz);
    if (x >= chartLeft && x <= chartLeft + chartWidth) {
      ctx.strokeStyle = colors.fundamental;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, chartTop);
      ctx.lineTo(x + 0.5, chartBottom);
      ctx.stroke();
      ctx.lineWidth = 1;
      const label = `${formatScientificPitchName(frequencyToMidi(fundamentalHz))} · ${formatHzDetailed(fundamentalHz)}`;
      ctx.font = "10px Tahoma, Segoe UI, sans-serif";
      ctx.fillStyle = colors.fundamental;
      ctx.fillText(label, Math.min(chartLeft + chartWidth - 4, x + 6), chartTop + 12);
    }
  }

  if (highlightProminent && prominentHz && prominentHz > 0) {
    const x = xForFreq(prominentHz);
    if (x >= chartLeft && x <= chartLeft + chartWidth) {
      ctx.strokeStyle = colors.prominent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, chartTop);
      ctx.lineTo(x + 0.5, chartBottom);
      ctx.stroke();
      ctx.lineWidth = 1;
      const label = `Prominent: ${formatScientificPitchName(frequencyToMidi(prominentHz))} · ${formatHzDetailed(prominentHz)}`;
      ctx.font = "10px Tahoma, Segoe UI, sans-serif";
      ctx.fillStyle = colors.prominent;
      ctx.fillText(label, Math.min(chartLeft + chartWidth - 4, x + 6), chartTop + 24);
    }
  }

  if (highlightOvertones && fundamentalHz && fundamentalHz > 0) {
    const overtoneFs = getOvertoneFrequencies(fundamentalHz, maxF);
    ctx.setLineDash([4, 3]);
    overtoneFs.forEach((hz, index) => {
      const x = xForFreq(hz);
      if (x < chartLeft || x > chartLeft + chartWidth) {
        return;
      }
      ctx.strokeStyle = colors.overtone;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, chartTop);
      ctx.lineTo(x + 0.5, chartBottom);
      ctx.stroke();
      ctx.font = "9px Tahoma, Segoe UI, sans-serif";
      ctx.fillStyle = colors.overtone;
      ctx.fillText(`${index + 2}×`, Math.max(chartLeft + 2, x - 6), chartTop + 22);
    });
    ctx.setLineDash([]);
  }
}
