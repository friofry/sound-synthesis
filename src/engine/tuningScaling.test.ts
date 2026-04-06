import { describe, expect, it } from "vitest";
import { GraphModel } from "./graph";
import { scaleGraphForPitchRatio, stiffnessRatioForPitchRatio } from "./gridGenerators";
import { runSimulation } from "./simulation";

function estimateFrequencyFromZeroCrossings(buffer: Float32Array, sampleRate: number): number {
  const start = Math.floor(buffer.length * 0.1);
  const end = Math.floor(buffer.length * 0.9);
  const crossings: number[] = [];

  for (let i = start + 1; i < end; i += 1) {
    if (buffer[i - 1] <= 0 && buffer[i] > 0) {
      crossings.push(i);
    }
  }

  if (crossings.length < 4) {
    throw new Error("Not enough zero crossings to estimate frequency.");
  }

  const periods: number[] = [];
  for (let i = 1; i < crossings.length; i += 1) {
    periods.push(crossings[i] - crossings[i - 1]);
  }
  const averagePeriod = periods.reduce((sum, value) => sum + value, 0) / periods.length;
  return sampleRate / averagePeriod;
}

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
  return estimateFrequencyFromZeroCrossings(result.playingPointBuffer, sampleRate);
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

    expect(observedRatio).toBeCloseTo(2, 0.15);
  });
});
