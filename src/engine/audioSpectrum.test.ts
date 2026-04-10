import { describe, expect, it } from "vitest";
import {
  computeBufferSpectrum,
  projectDecibelSpectrumToLogBands,
  projectSpectrumToLogBands,
} from "./audioSpectrum";

function buildSineWave(frequency: number, sampleRate: number, sampleCount: number): Float32Array {
  return Float32Array.from(
    { length: sampleCount },
    (_, index) => Math.sin((2 * Math.PI * frequency * index) / sampleRate),
  );
}

function findPeakIndex(values: number[]): number {
  return values.reduce((peakIndex, value, index, source) => (
    value > source[peakIndex] ? index : peakIndex
  ), 0);
}

describe("audioSpectrum", () => {
  it("finds the same dominant tone with DFT and FFT", () => {
    const sampleRate = 8192;
    const buffer = buildSineWave(440, sampleRate, 1024);

    const dftSpectrum = computeBufferSpectrum(buffer, sampleRate, {
      algorithm: "dft",
      frameSize: 1024,
      binCount: 128,
      normalize: false,
    });
    const fftSpectrum = computeBufferSpectrum(buffer, sampleRate, {
      algorithm: "fft",
      frameSize: 1024,
      binCount: 128,
      normalize: false,
    });

    const dftPeak = dftSpectrum.reduce((peak, point) => point.magnitude > peak.magnitude ? point : peak, dftSpectrum[0]);
    const fftPeak = fftSpectrum.reduce((peak, point) => point.magnitude > peak.magnitude ? point : peak, fftSpectrum[0]);

    expect(dftPeak.frequency).toBe(440);
    expect(fftPeak.frequency).toBe(440);
    expect(fftPeak.magnitude).toBeCloseTo(dftPeak.magnitude, 9);
  });

  it("keeps FFT numerically aligned with DFT across bins", () => {
    const sampleRate = 8192;
    const buffer = buildSineWave(880, sampleRate, 1024);

    const dftSpectrum = computeBufferSpectrum(buffer, sampleRate, {
      algorithm: "dft",
      frameSize: 1024,
      binCount: 96,
      normalize: false,
    });
    const fftSpectrum = computeBufferSpectrum(buffer, sampleRate, {
      algorithm: "fft",
      frameSize: 1024,
      binCount: 96,
      normalize: false,
    });

    expect(fftSpectrum).toHaveLength(dftSpectrum.length);
    for (let index = 0; index < dftSpectrum.length; index += 1) {
      expect(fftSpectrum[index].frequency).toBe(dftSpectrum[index].frequency);
      expect(fftSpectrum[index].magnitude).toBeCloseTo(dftSpectrum[index].magnitude, 9);
    }
  });

  it("projects spectrum magnitudes into log bands", () => {
    const spectrum = [
      { frequency: 110, magnitude: 0.25 },
      { frequency: 440, magnitude: 1 },
      { frequency: 1760, magnitude: 0.36 },
    ];

    const linearBands = projectSpectrumToLogBands(spectrum, {
      barCount: 16,
      minFrequency: 50,
      maxFrequency: 2000,
    });
    const sqrtBands = projectSpectrumToLogBands(spectrum, {
      barCount: 16,
      minFrequency: 50,
      maxFrequency: 2000,
      magnitudeTransform: "sqrt",
    });

    const linearPeakIndex = findPeakIndex(linearBands);
    const sqrtPeakIndex = findPeakIndex(sqrtBands);

    expect(linearPeakIndex).toBe(sqrtPeakIndex);
    expect(linearBands[linearPeakIndex]).toBe(1);
    expect(sqrtBands[linearPeakIndex]).toBe(1);
    expect(sqrtBands.some((value, index) => value > linearBands[index])).toBe(true);
  });

  it("maps float decibels into normalized log bands", () => {
    const data = new Float32Array(512).fill(-96);
    data[55] = -12;

    const bands = projectDecibelSpectrumToLogBands(data, 8192, {
      barCount: 24,
      minFrequency: 30,
      maxFrequency: 2000,
      minDecibels: -96,
      maxDecibels: -12,
    });

    const peakIndex = findPeakIndex(bands);

    expect(bands[peakIndex]).toBe(1);
    expect(bands.every((value) => value >= 0 && value <= 1)).toBe(true);
  });

  it("returns an empty buffer spectrum when not enough samples are available", () => {
    const buffer = buildSineWave(440, 8192, 32);

    expect(computeBufferSpectrum(buffer, 8192)).toEqual([]);
  });
});
