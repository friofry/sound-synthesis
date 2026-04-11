import { describe, expect, it } from "vitest";
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
  resetPitchAnalysisWasmCacheForTests,
} from "./pitchAnalysisWasm";

function assertClose(a: number | null, b: number | null, epsHz: number): void {
  if (a === null && b === null) {
    return;
  }
  expect(a).not.toBeNull();
  expect(b).not.toBeNull();
  expect(Math.abs((a as number) - (b as number))).toBeLessThanOrEqual(epsHz);
}

describe("pitch analysis wasm parity", () => {
  it("loads wasm", () => {
    resetPitchAnalysisWasmCacheForTests();
    expect(isPitchAnalysisWasmLoaded()).toBe(true);
  });

  it("findDominantFrequencyDecibels matches", () => {
    const n = 4096;
    const data = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      data[i] = -40 + (i % 17) * 0.5;
    }
    const sr = 44100;
    const minHz = 80;
    const maxHz = 2000;
    const js = findDominantFrequencyDecibelsJs(data, sr, minHz, maxHz);
    const wasm = findDominantFrequencyDecibelsWasm(data, sr, minHz, maxHz);
    assertClose(js, wasm, 0.05);
  });

  it("findDominantFrequencyLinearMagnitudes matches", () => {
    const n = 2048;
    const mags = new Float64Array(n);
    for (let i = 0; i < n; i += 1) {
      mags[i] = Math.abs(Math.sin(i * 0.01)) * (1 + (i % 7) * 0.01);
    }
    const sr = 48000;
    const frameSize = 4096;
    const minHz = 100;
    const maxHz = 4000;
    const js = findDominantFrequencyLinearMagnitudesJs(mags, sr, frameSize, minHz, maxHz);
    const wasm = findDominantFrequencyLinearMagnitudesWasm(mags, sr, frameSize, minHz, maxHz);
    assertClose(js, wasm, 0.05);
  });

  it("findDominantFrequencySpectrumPoints matches", () => {
    const points: { frequency: number; magnitude: number }[] = [];
    for (let i = 0; i < 512; i += 1) {
      points.push({ frequency: 20 + i * 3.7, magnitude: Math.exp(-Math.abs(i - 100) * 0.02) });
    }
    const minHz = 50;
    const maxHz = 800;
    const js = findDominantFrequencySpectrumPointsJs(points, minHz, maxHz);
    const wasm = findDominantFrequencySpectrumPointsWasm(points, minHz, maxHz);
    assertClose(js, wasm, 0.05);
  });

  it("pickLoudestStftFrameIndex matches", () => {
    const frames: Float64Array[] = [];
    for (let f = 0; f < 32; f += 1) {
      const row = new Float64Array(256);
      for (let i = 0; i < 256; i += 1) {
        row[i] = f === 17 ? 10 + i : i * 0.01;
      }
      frames.push(row);
    }
    expect(pickLoudestStftFrameIndexJs(frames)).toBe(pickLoudestStftFrameIndexWasm(frames));
  });
});
