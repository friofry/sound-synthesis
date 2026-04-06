import { bench, describe } from "vitest";
import { generateGraph } from "./gridGenerators";
import { runSimulation } from "./simulation";
import type { GraphData, GridParams, SimMethod, SimulationBackend, SimulationParams } from "./types";

const GRID_SIZE = 25;
const CENTER_COORD = Math.floor(GRID_SIZE / 2);
const CENTER_INDEX = CENTER_COORD * GRID_SIZE + CENTER_COORD;
const SAMPLE_RATE = 44_100;
const DURATION_MS = 150;

const GRID_PARAMS: GridParams = {
  n: GRID_SIZE,
  m: GRID_SIZE,
  layers: 1,
  stiffness: 1,
  weight: 0.000001,
  fixedBorder: true,
  stiffnessType: "isotropic",
  width: 1200,
  height: 700,
};

const BASE_PARAMS: Omit<SimulationParams, "method"> = {
  sampleRate: SAMPLE_RATE,
  // Match the same ms -> blocks rounding used by note generation in the app.
  lengthK: Math.max(1, Math.ceil(Math.ceil((SAMPLE_RATE * DURATION_MS) / 1000) / 1024)),
  attenuation: 4,
  squareAttenuation: 0.08,
  playingPoint: CENTER_INDEX,
};

const graph = buildCenteredImpulseGraph();

function buildCenteredImpulseGraph(): GraphData {
  const next = generateGraph("cell", GRID_PARAMS);
  next.setDotProps(CENTER_INDEX, { u: 1, v: 0 });
  next.playingPoint = CENTER_INDEX;
  return next.toGraphData();
}

function generateNote(method: SimMethod, backend: SimulationBackend): Float32Array {
  const result = runSimulation(graph, { ...BASE_PARAMS, method }, undefined, {
    capture: "playing-point-only",
    backend,
  });
  return result.playingPointBuffer;
}

describe("note generation benchmark", () => {
  bench("25x25 grid, center impulse, center read, 150ms, Euler-Cramer (legacy)", () => {
    generateNote("euler", "legacy");
  });

  bench("25x25 grid, center impulse, center read, 150ms, Euler-Cramer (optimized)", () => {
    generateNote("euler", "optimized");
  });

  bench("25x25 grid, center impulse, center read, 150ms, Euler-Cramer (edge-list)", () => {
    generateNote("euler", "edge-list");
  });

  bench("25x25 grid, center impulse, center read, 150ms, Euler-Cramer (edge-types)", () => {
    generateNote("euler", "edge-types");
  });

  bench("25x25 grid, center impulse, center read, 150ms, Runge-Kutta (legacy)", () => {
    generateNote("runge-kutta", "legacy");
  });

  bench("25x25 grid, center impulse, center read, 150ms, Runge-Kutta (optimized)", () => {
    generateNote("runge-kutta", "optimized");
  });

  bench("25x25 grid, center impulse, center read, 150ms, Runge-Kutta (edge-list)", () => {
    generateNote("runge-kutta", "edge-list");
  });

  bench("25x25 grid, center impulse, center read, 150ms, Runge-Kutta (edge-types)", () => {
    generateNote("runge-kutta", "edge-types");
  });
});
