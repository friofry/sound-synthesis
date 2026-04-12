import { describe, expect, it } from "vitest";
import { generateGaussNoiseBuffer } from "./generateGaussNoise";

describe("generateGaussNoiseBuffer", () => {
  it("produces the expected length", () => {
    const buf = generateGaussNoiseBuffer({
      sampleRate: 8000,
      durationSeconds: 0.25,
      points: 250,
      dispersion: 2.5,
      maxAmplitude: 5000,
      seed: 42,
    });
    expect(buf.length).toBe(2000);
  });

  it("is deterministic for the same seed", () => {
    const params = {
      sampleRate: 44100,
      durationSeconds: 0.01,
      points: 100,
      dispersion: 1,
      maxAmplitude: 3000,
      seed: 999,
    };
    const a = generateGaussNoiseBuffer(params);
    const b = generateGaussNoiseBuffer(params);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i += 1) {
      expect(a[i]).toBe(b[i]);
    }
  });

  it("changes when seed changes", () => {
    const base = {
      sampleRate: 8000,
      durationSeconds: 0.1,
      points: 250,
      dispersion: 2.5,
      maxAmplitude: 5000,
    };
    const a = generateGaussNoiseBuffer({ ...base, seed: 1 });
    const b = generateGaussNoiseBuffer({ ...base, seed: 2 });
    let diff = 0;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) {
        diff += 1;
      }
    }
    expect(diff).toBeGreaterThan(0);
  });
});
