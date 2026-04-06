import { describe, expect, it } from "vitest";
import { GraphModel } from "./graph";
import { scaleGraphForPitchRatio, stiffnessRatioForPitchRatio } from "./gridGenerators";
import { runSimulation } from "./simulation";
import { derivePitchCalibrationRatio, estimateFrequencyFromZeroCrossings } from "./tuning";

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
});
