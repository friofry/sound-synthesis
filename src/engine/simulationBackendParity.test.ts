import { describe, expect, it } from "vitest";
import { generateGraph } from "./gridGenerators";
import { runSimulation } from "./simulation";
import type { GraphData, GridParams, SimulationParams } from "./types";

function buildParityGraphData(): GraphData {
  const params: GridParams = {
    n: 8,
    m: 8,
    layers: 1,
    stiffness: 1,
    weight: 0.000001,
    fixedBorder: true,
    stiffnessType: "isotropic",
    width: 1200,
    height: 700,
  };
  const graph = generateGraph("cell", params);
  const center = Math.floor(params.n / 2) * params.m + Math.floor(params.m / 2);
  graph.setDotProps(center, { u: 1, v: 0 });
  graph.playingPoint = center;
  return graph.toGraphData();
}

function expectCloseArray(a: ArrayLike<number>, b: ArrayLike<number>, precision = 8): void {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i += 1) {
    expect(a[i]).toBeCloseTo(b[i], precision);
  }
}

describe("simulation backend parity", () => {
  it("matches legacy in full capture for euler and runge-kutta", () => {
    const graph = buildParityGraphData();
    const methods: SimulationParams["method"][] = ["euler", "runge-kutta"];

    for (const method of methods) {
      const params: SimulationParams = {
        sampleRate: 8_000,
        lengthK: 2,
        method,
        attenuation: 4,
        squareAttenuation: 0.08,
        playingPoint: graph.playingPoint,
      };

      const legacy = runSimulation(graph, params, undefined, { capture: "full", backend: "legacy" });
      const optimized = runSimulation(graph, params, undefined, { capture: "full", backend: "optimized" });

      expectCloseArray(optimized.playingPointBuffer, legacy.playingPointBuffer, 8);
      expect(optimized.frames.length).toBe(legacy.frames.length);
      expect(optimized.allPointBuffers.length).toBe(legacy.allPointBuffers.length);

      const sampleIndices = [0, Math.floor(legacy.frames.length / 2), legacy.frames.length - 1];
      for (const sampleIndex of sampleIndices) {
        const legacyFrame = legacy.frames[sampleIndex];
        const optimizedFrame = optimized.frames[sampleIndex];
        expectCloseArray(optimizedFrame, legacyFrame, 8);
      }
    }
  });

  it("matches legacy in playing-point-only capture for euler and runge-kutta", () => {
    const graph = buildParityGraphData();
    const methods: SimulationParams["method"][] = ["euler", "runge-kutta"];

    for (const method of methods) {
      const params: SimulationParams = {
        sampleRate: 8_000,
        lengthK: 2,
        method,
        attenuation: 4,
        squareAttenuation: 0.08,
        playingPoint: graph.playingPoint,
      };

      const legacy = runSimulation(graph, params, undefined, { capture: "playing-point-only", backend: "legacy" });
      const optimized = runSimulation(graph, params, undefined, { capture: "playing-point-only", backend: "optimized" });

      expect(legacy.frames.length).toBe(0);
      expect(legacy.allPointBuffers.length).toBe(0);
      expect(optimized.frames.length).toBe(0);
      expect(optimized.allPointBuffers.length).toBe(0);
      expectCloseArray(optimized.playingPointBuffer, legacy.playingPointBuffer, 8);
    }
  });
});
