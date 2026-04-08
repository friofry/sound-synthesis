import type { FloatArray, SimulationResult } from "./types";
import { applyEndFadeOut, applyStartFadeIn } from "./simulationFade";

type RunSimulationOutputOptions = {
  totalDots: number;
  totalSamples: number;
  playingPoint: number;
  sampleRate: number;
  captureFull: boolean;
  readState: () => FloatArray;
  onProgress?: (completed: number, total: number) => void;
  onBeforeSample?: (sample: number) => void;
};

export function runSimulationOutputLoop(options: RunSimulationOutputOptions): SimulationResult {
  const {
    totalDots,
    totalSamples,
    playingPoint,
    sampleRate,
    captureFull,
    readState,
    onProgress,
    onBeforeSample,
  } = options;

  const frames: FloatArray[] = captureFull ? new Array(totalSamples) : [];
  const playingPointBuffer = new Float32Array(totalSamples);
  const packedHistory = captureFull ? new Float64Array(totalSamples * totalDots) : null;

  for (let sample = 0; sample < totalSamples; sample += 1) {
    onBeforeSample?.(sample);
    const u = readState();

    if (packedHistory) {
      packedHistory.set(u, sample * totalDots);
    }
    playingPointBuffer[sample] = u[playingPoint] ?? 0;

    if (onProgress && (sample % 128 === 0 || sample === totalSamples - 1)) {
      onProgress(sample + 1, totalSamples);
    }
  }

  let allPointBuffers: Float32Array[] = [];
  if (packedHistory) {
    for (let sample = 0; sample < totalSamples; sample += 1) {
      const offset = sample * totalDots;
      frames[sample] = packedHistory.subarray(offset, offset + totalDots);
    }

    allPointBuffers = Array.from({ length: totalDots }, () => new Float32Array(totalSamples));
    for (let sample = 0; sample < totalSamples; sample += 1) {
      const offset = sample * totalDots;
      for (let dot = 0; dot < totalDots; dot += 1) {
        allPointBuffers[dot][sample] = packedHistory[offset + dot];
      }
    }
  }

  applyStartFadeIn(playingPointBuffer, sampleRate);
  applyEndFadeOut(playingPointBuffer, sampleRate);
  return { frames, allPointBuffers, playingPointBuffer };
}
