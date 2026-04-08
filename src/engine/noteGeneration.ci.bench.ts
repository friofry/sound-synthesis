import { bench, describe } from "vitest";
import { generateGraph } from "./gridGenerators";
import { runSimulation } from "./simulation";
import {
  CI_BENCHMARK_BACKENDS,
  DEFAULT_SIMULATION_METHOD,
  DEFAULT_SIMULATION_SUBSTEPS,
  DEFAULT_SIMULATION_SUBSTEPS_MODE,
} from "./simulationDefaults";
import type { GraphData, GridParams, SimulationParams } from "./types";

const GRID_SIZE = 25;
const CENTER_COORD = Math.floor(GRID_SIZE / 2);
const CENTER_INDEX = CENTER_COORD * GRID_SIZE + CENTER_COORD;
const SAMPLE_RATE = 44_100;
const DURATION_MS = 20;

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
  lengthK: Math.max(1, Math.ceil(Math.ceil((SAMPLE_RATE * DURATION_MS) / 1000) / 1024)),
  attenuation: 4,
  squareAttenuation: 0.08,
  playingPoint: CENTER_INDEX,
  substepsMode: DEFAULT_SIMULATION_SUBSTEPS_MODE,
  substeps: DEFAULT_SIMULATION_SUBSTEPS,
};

const graph = buildCenteredImpulseGraph();

function buildCenteredImpulseGraph(): GraphData {
  const next = generateGraph("cell", GRID_PARAMS);
  next.setDotProps(CENTER_INDEX, { u: 1, v: 0 });
  next.playingPoint = CENTER_INDEX;
  return next.toGraphData();
}

describe("ci note generation benchmark", () => {
  for (const backend of CI_BENCHMARK_BACKENDS) {
    bench(`25x25 grid, 20ms, ${DEFAULT_SIMULATION_METHOD}, ${backend}`, () => {
      runSimulation(
        graph,
        { ...BASE_PARAMS, method: DEFAULT_SIMULATION_METHOD },
        undefined,
        { capture: "playing-point-only", backend },
      );
    });
  }
});
