const CALIBRATION_MIN_RATIO = 0.5;
const CALIBRATION_MAX_RATIO = 2;

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

export function derivePitchCalibrationRatio(targetFrequency: number, measuredFrequency: number): number {
  if (targetFrequency <= 0 || measuredFrequency <= 0 || !Number.isFinite(targetFrequency) || !Number.isFinite(measuredFrequency)) {
    return 1;
  }
  const ratio = targetFrequency / measuredFrequency;
  return Math.max(CALIBRATION_MIN_RATIO, Math.min(CALIBRATION_MAX_RATIO, ratio));
}
