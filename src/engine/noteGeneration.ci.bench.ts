import { bench, describe } from "vitest";
import { generateGraph } from "./gridGenerators";
import { runSimulation } from "./simulation";
import {
  CI_BENCHMARK_BACKENDS,
  DEFAULT_SIMULATION_METHOD,
  DEFAULT_SIMULATION_SUBSTEPS,
  DEFAULT_SIMULATION_SUBSTEPS_MODE,
} from "./simulationDefaults";
import type { GraphData, GridParams, GridType, SimulationParams } from "./types";

const GRID_SIZE = 25;
const SAMPLE_RATE = 44_100;
const DURATION_MS = 20;
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 700;

const GRID_PARAMS: GridParams = {
  n: GRID_SIZE,
  m: GRID_SIZE,
  layers: 1,
  stiffness: 1,
  weight: 0.000001,
  fixedBorder: true,
  stiffnessType: "isotropic",
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
};

type TopologyBenchmarkCase = {
  label: string;
  type: GridType;
  gridOverrides: Partial<Pick<GridParams, "n" | "m" | "layers">>;
};

const TOPOLOGY_CASES: readonly TopologyBenchmarkCase[] = [
  { label: "cell", type: "cell", gridOverrides: { n: GRID_SIZE, m: GRID_SIZE, layers: 1 } },
  { label: "perimeter", type: "perimeter", gridOverrides: { n: GRID_SIZE, m: GRID_SIZE, layers: 1 } },
  { label: "empty", type: "empty", gridOverrides: { n: GRID_SIZE, m: GRID_SIZE, layers: 1 } },
  { label: "triangle", type: "triangle", gridOverrides: { n: GRID_SIZE, m: GRID_SIZE, layers: 1 } },
  { label: "astra", type: "astra", gridOverrides: { n: 24, m: 12, layers: 12 } },
  { label: "hexagon", type: "hexagon", gridOverrides: { n: 12, m: 12, layers: 12 } },
  { label: "disk-hex", type: "disk-hex", gridOverrides: { n: 12, m: 12, layers: 12 } },
] as const;

const BASE_PARAMS: Omit<SimulationParams, "method" | "playingPoint"> = {
  sampleRate: SAMPLE_RATE,
  lengthK: Math.max(1, Math.ceil(Math.ceil((SAMPLE_RATE * DURATION_MS) / 1000) / 1024)),
  attenuation: 4,
  squareAttenuation: 0.08,
  substepsMode: DEFAULT_SIMULATION_SUBSTEPS_MODE,
  substeps: DEFAULT_SIMULATION_SUBSTEPS,
};

const topologyGraphs = TOPOLOGY_CASES.map((topology) => ({
  ...topology,
  graph: buildCenteredImpulseGraph(topology),
}));

function buildCenteredImpulseGraph(topology: TopologyBenchmarkCase): GraphData {
  const next = generateGraph(topology.type, { ...GRID_PARAMS, ...topology.gridOverrides });
  const centerIndex = next.getDotIndexByCoords(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, Number.POSITIVE_INFINITY);
  const playingPoint = centerIndex >= 0 ? centerIndex : next.findFirstPlayableDot();
  next.setDotProps(playingPoint, { u: 1, v: 0 });
  next.playingPoint = playingPoint;
  return next.toGraphData();
}

describe("ci note generation benchmark", () => {
  for (const topology of topologyGraphs) {
    for (const backend of CI_BENCHMARK_BACKENDS) {
      bench(`${topology.label}, 20ms, ${DEFAULT_SIMULATION_METHOD}, ${backend}`, () => {
        runSimulation(
          topology.graph,
          {
            ...BASE_PARAMS,
            method: DEFAULT_SIMULATION_METHOD,
            playingPoint: topology.graph.playingPoint,
          },
          undefined,
          { capture: "playing-point-only", backend },
        );
      });
    }
  }
});
