import { bench, describe } from "vitest";
import {
  findDominantFrequencyDecibelsJs,
  findDominantFrequencyLinearMagnitudesJs,
  findDominantFrequencySpectrumPointsJs,
  pickLoudestStftFrameIndexJs,
} from "./pitchAnalysis";
import {
  findDominantFrequencyDecibelsWasm,
  findDominantFrequencyLinearMagnitudesWasm,
  findDominantFrequencySpectrumPointsWasm,
  isPitchAnalysisWasmLoaded,
  pickLoudestStftFrameIndexWasm,
} from "./pitchAnalysisWasm";

const SAMPLE_RATE = 44100;
const MIN_HZ = 80;
const MAX_HZ = 8000;

const DECIBEL_BINS = 8192;
const decibelData = new Float32Array(DECIBEL_BINS);
for (let i = 0; i < DECIBEL_BINS; i += 1) {
  decibelData[i] = -50 + (i % 31) * 0.4;
}

const LINEAR_BINS = 4096;
const FRAME_SIZE = 8192;
const linearMags = new Float64Array(LINEAR_BINS);
for (let i = 0; i < LINEAR_BINS; i += 1) {
  linearMags[i] = Math.abs(Math.sin(i * 0.02)) * (1 + (i % 11) * 0.02);
}

const SPECTRUM_LEN = 1024;
const spectrumPoints: { frequency: number; magnitude: number }[] = [];
for (let i = 0; i < SPECTRUM_LEN; i += 1) {
  spectrumPoints.push({ frequency: 30 + i * 4.2, magnitude: Math.exp(-Math.abs(i - 200) * 0.015) });
}

const STFT_FRAMES = 64;
const STFT_BINS = 512;
const stftFrames: Float64Array[] = [];
for (let f = 0; f < STFT_FRAMES; f += 1) {
  const row = new Float64Array(STFT_BINS);
  for (let i = 0; i < STFT_BINS; i += 1) {
    row[i] = (f + 1) * 0.001 * (i + 1);
  }
  stftFrames.push(row);
}

if (!isPitchAnalysisWasmLoaded()) {
  throw new Error("pitch analysis wasm must load for frequency benchmarks");
}

describe("frequency / pitch HPS benchmarks", () => {
  bench(`dominantDecibels;bins=${DECIBEL_BINS};impl=js`, () => {
    findDominantFrequencyDecibelsJs(decibelData, SAMPLE_RATE, MIN_HZ, MAX_HZ);
  });

  bench(`dominantDecibels;bins=${DECIBEL_BINS};impl=wasm`, () => {
    findDominantFrequencyDecibelsWasm(decibelData, SAMPLE_RATE, MIN_HZ, MAX_HZ);
  });

  bench(`dominantLinearMag;bins=${LINEAR_BINS};impl=js`, () => {
    findDominantFrequencyLinearMagnitudesJs(linearMags, SAMPLE_RATE, FRAME_SIZE, MIN_HZ, MAX_HZ);
  });

  bench(`dominantLinearMag;bins=${LINEAR_BINS};impl=wasm`, () => {
    findDominantFrequencyLinearMagnitudesWasm(linearMags, SAMPLE_RATE, FRAME_SIZE, MIN_HZ, MAX_HZ);
  });

  bench(`dominantSpectrumPoints;points=${SPECTRUM_LEN};impl=js`, () => {
    findDominantFrequencySpectrumPointsJs(spectrumPoints, MIN_HZ, MAX_HZ);
  });

  bench(`dominantSpectrumPoints;points=${SPECTRUM_LEN};impl=wasm`, () => {
    findDominantFrequencySpectrumPointsWasm(spectrumPoints, MIN_HZ, MAX_HZ);
  });

  bench(`pickLoudestStftFrame;frames=${STFT_FRAMES};bins=${STFT_BINS};impl=js`, () => {
    pickLoudestStftFrameIndexJs(stftFrames);
  });

  bench(`pickLoudestStftFrame;frames=${STFT_FRAMES};bins=${STFT_BINS};impl=wasm`, () => {
    pickLoudestStftFrameIndexWasm(stftFrames);
  });
});
