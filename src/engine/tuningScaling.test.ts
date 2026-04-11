import { describe, expect, it } from "vitest";
import { GraphModel } from "./graph";
import { scaleGraphForPitchRatio, stiffnessRatioForPitchRatio } from "./gridGenerators";
import { runSimulation } from "./simulation";
import {
  derivePitchCalibrationRatio,
  estimateFrequencyFromZeroCrossings,
  estimateProminentFrequencyAWeighted,
} from "./tuning";

function buildSingleSpringGraph(baseK: number): GraphModel {
  const graph = new GraphModel();
  const free = graph.addDot(0, 0, 1, 0, 1, false);
  const fixed = graph.addDot(1, 0, 0, 0, 1, true);
  graph.addLine(free, fixed, baseK);
  graph.playingPoint = free;
  return graph;
}

function simulateFundamental(graph: GraphModel, sampleRate: number): number {
  const result = runSimulation(graph.toGraphData(), {
    sampleRate,
    lengthK: 64,
    method: "runge-kutta",
    attenuation: 0,
    squareAttenuation: 0,
    playingPoint: graph.playingPoint ?? 0,
  });
  const frequency = estimateFrequencyFromZeroCrossings(result.playingPointBuffer, sampleRate);
  if (frequency === null) {
    throw new Error("Unable to estimate fundamental frequency");
  }
  return frequency;
}

describe("pitch-to-stiffness scaling", () => {
  it("maps pitch ratio to squared stiffness ratio", () => {
    expect(stiffnessRatioForPitchRatio(2)).toBe(4);
    expect(stiffnessRatioForPitchRatio(Math.SQRT2)).toBeCloseTo(2, 10);
  });

  it("keeps octave ratio when retuning physical stiffness", () => {
    const sampleRate = 48_000;
    const baseGraph = buildSingleSpringGraph(10_000_000);
    const octaveGraph = scaleGraphForPitchRatio(baseGraph, 2);

    const baseFrequency = simulateFundamental(baseGraph, sampleRate);
    const octaveFrequency = simulateFundamental(octaveGraph, sampleRate);
    const observedRatio = octaveFrequency / baseFrequency;

    expect(Math.abs(observedRatio - 2)).toBeLessThan(0.15);
  });

  it("derives calibration ratio from measured first note frequency", () => {
    expect(derivePitchCalibrationRatio(200, 100)).toBe(2);
    expect(derivePitchCalibrationRatio(100, 200)).toBe(0.5);
    expect(derivePitchCalibrationRatio(100, 0)).toBe(1);
  });

  it("estimates A-weighted prominent peak from a pure tone", () => {
    const sampleRate = 48_000;
    const frequency = 440;
    const size = 16384;
    const buffer = new Float32Array(size);
    for (let i = 0; i < size; i += 1) {
      const t = i / sampleRate;
      buffer[i] = Math.sin(2 * Math.PI * frequency * t);
    }
    const prominent = estimateProminentFrequencyAWeighted(buffer, sampleRate);
    expect(prominent).not.toBeNull();
    expect(Math.abs((prominent as number) - frequency)).toBeLessThan(3);
  });

  it("prefers perceptually louder harmonic for A-weighted prominence", () => {
    const sampleRate = 48_000;
    const fundamental = 261.63;
    const harmonic = fundamental * 2;
    const size = 16384;
    const buffer = new Float32Array(size);
    for (let i = 0; i < size; i += 1) {
      const t = i / sampleRate;
      buffer[i] = 0.35 * Math.sin(2 * Math.PI * fundamental * t) + 1.0 * Math.sin(2 * Math.PI * harmonic * t);
    }
    const prominent = estimateProminentFrequencyAWeighted(buffer, sampleRate);
    expect(prominent).not.toBeNull();
    expect(Math.abs((prominent as number) - harmonic)).toBeLessThan(4);
  });
});
