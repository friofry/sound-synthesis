import { computeBufferSpectrum } from "./audioSpectrum";

const CALIBRATION_MIN_RATIO = 0.5;
const CALIBRATION_MAX_RATIO = 2;
const A_WEIGHTING_FLOOR_HZ = 10;
const CALIBRATION_ANALYSIS_MAX_FRAME = 16384;
const CALIBRATION_ANALYSIS_MIN_FRAME = 256;

export function estimateFrequencyFromZeroCrossings(buffer: Float32Array, sampleRate: number): number | null {
  if (sampleRate <= 0 || buffer.length < 16) {
    return null;
  }

  const start = Math.floor(buffer.length * 0.1);
  const end = Math.floor(buffer.length * 0.9);
  const crossings: number[] = [];

  for (let i = start + 1; i < end; i += 1) {
    if (buffer[i - 1] <= 0 && buffer[i] > 0) {
      crossings.push(i);
    }
  }

  if (crossings.length < 4) {
    return null;
  }

  let periodsSum = 0;
  for (let i = 1; i < crossings.length; i += 1) {
    periodsSum += crossings[i] - crossings[i - 1];
  }
  const averagePeriod = periodsSum / (crossings.length - 1);
  if (!Number.isFinite(averagePeriod) || averagePeriod <= 0) {
    return null;
  }

  return sampleRate / averagePeriod;
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

function chooseCalibrationFrameSize(sampleCount: number): number {
  if (!Number.isFinite(sampleCount) || sampleCount < CALIBRATION_ANALYSIS_MIN_FRAME) {
    return 0;
  }
  const cap = Math.min(sampleCount, CALIBRATION_ANALYSIS_MAX_FRAME);
  const pow2 = 2 ** Math.floor(Math.log2(cap));
  return Math.max(0, pow2);
}

/**
 * Finds the most perceptually-prominent (A-weighted) local spectral peak.
 * Useful for calibration when the physical model has strong upper harmonics.
 */
export function estimateProminentFrequencyAWeighted(
  buffer: Float32Array,
  sampleRate: number,
  minHz = 20,
  maxHz = 5000,
): number | null {
  if (sampleRate <= 0 || buffer.length < CALIBRATION_ANALYSIS_MIN_FRAME || maxHz <= minHz) {
    return null;
  }
  const frameSize = chooseCalibrationFrameSize(buffer.length);
  if (frameSize < CALIBRATION_ANALYSIS_MIN_FRAME) {
    return null;
  }
  const start = Math.max(
    0,
    Math.min(
      buffer.length - frameSize,
      Math.floor(buffer.length * 0.1),
    ),
  );
  const frame = buffer.subarray(start, start + frameSize);
  const spectrum = computeBufferSpectrum(frame, sampleRate, {
    algorithm: "fft",
    frameSize,
    binCount: Math.max(3, Math.floor(frameSize / 2) - 1),
    minSampleCount: frameSize,
    normalize: false,
  });
  if (spectrum.length < 3) {
    return null;
  }

  let bestFrequency: number | null = null;
  let bestScore = -1;
  for (let i = 1; i < spectrum.length - 1; i += 1) {
    const point = spectrum[i];
    const frequency = point.frequency;
    if (frequency < minHz || frequency > maxHz) {
      continue;
    }
    const magnitude = Math.max(0, point.magnitude);
    if (magnitude <= 0) {
      continue;
    }
    const score = magnitude * aWeightingLinearGain(frequency);
    if (score <= 0) {
      continue;
    }
    const prev = Math.max(0, spectrum[i - 1].magnitude) * aWeightingLinearGain(spectrum[i - 1].frequency);
    const next = Math.max(0, spectrum[i + 1].magnitude) * aWeightingLinearGain(spectrum[i + 1].frequency);
    if (score < prev || score < next) {
      continue;
    }
    if (score > bestScore) {
      bestScore = score;
      bestFrequency = frequency;
    }
  }
  return bestFrequency;
}

export function derivePitchCalibrationRatio(targetFrequency: number, measuredFrequency: number): number {
  if (targetFrequency <= 0 || measuredFrequency <= 0 || !Number.isFinite(targetFrequency) || !Number.isFinite(measuredFrequency)) {
    return 1;
  }
  const ratio = targetFrequency / measuredFrequency;
  return Math.max(CALIBRATION_MIN_RATIO, Math.min(CALIBRATION_MAX_RATIO, ratio));
}
