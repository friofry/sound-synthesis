import { bench, describe } from "vitest";
import { generateGraph } from "./gridGenerators";
import { runSimulation } from "./simulation";
import {
  SIMULATION_BACKEND_OPTIONS,
  type GraphData,
  type GridParams,
  type GridType,
  type SimMethod,
  type SimulationBackend,
  type SimulationParams,
  type SimulationPrecision,
} from "./types";

const SAMPLE_RATE = 44_100;
const DURATION_MS = 150;
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 700;
const TARGET_FREE_NODES = 256;

const BASE_GRID_PARAMS: GridParams = {
  n: 16,
  m: 16,
  layers: 1,
  stiffness: 1,
  weight: 0.000001,
  stiffnessType: "isotropic",
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  boundaryMode: "free",
};

type TopologyCase = {
  label: string;
  type: GridType;
  gridOverrides: Partial<Pick<GridParams, "n" | "m" | "layers">>;
};

const TOPOLOGY_CASES: readonly TopologyCase[] = [
  { label: "cell", type: "cell", gridOverrides: { n: 16, m: 16, layers: 1 } },
  { label: "perimeter", type: "perimeter", gridOverrides: { n: 66, m: 66, layers: 1 } },
  { label: "empty", type: "empty", gridOverrides: { n: 16, m: 16, layers: 1 } },
  { label: "triangle", type: "triangle", gridOverrides: { n: 16, m: 16, layers: 1 } },
  { label: "astra", type: "astra", gridOverrides: { n: 17, m: 15, layers: 15 } },
  { label: "hexagon", type: "hexagon", gridOverrides: { n: 9, m: 9, layers: 9 } },
  { label: "disk-hex", type: "disk-hex", gridOverrides: { n: 12, m: 12, layers: 12 } },
] as const;

type PreparedTopologyCase = {
  label: string;
  graph: GraphData;
  freeNodeCount: number;
};

const BENCH_BACKENDS: readonly SimulationBackend[] = SIMULATION_BACKEND_OPTIONS.map((option) => option.value);
const METHODS: readonly SimMethod[] = ["euler", "runge-kutta"];
const PRECISIONS: readonly SimulationPrecision[] = [32, 64];

const BASE_PARAMS: Omit<SimulationParams, "method" | "playingPoint"> = {
  sampleRate: SAMPLE_RATE,
  // Match the same ms -> blocks rounding used by note generation in the app.
  lengthK: Math.max(1, Math.ceil(Math.ceil((SAMPLE_RATE * DURATION_MS) / 1000) / 1024)),
  attenuation: 4,
  squareAttenuation: 0.08,
};

const preparedTopologies: readonly PreparedTopologyCase[] = TOPOLOGY_CASES.map(prepareTopologyCase);

function prepareTopologyCase(topology: TopologyCase): PreparedTopologyCase {
  const graphModel = generateGraph(topology.type, { ...BASE_GRID_PARAMS, ...topology.gridOverrides });
  const freeNodeCount = enforceFreeNodeTarget(graphModel, TARGET_FREE_NODES);
  const playingPoint = graphModel.getDotIndexByCoords(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, Number.POSITIVE_INFINITY);
  const resolvedPlayingPoint = playingPoint >= 0 ? playingPoint : graphModel.findFirstPlayableDot();
  graphModel.setDotProps(resolvedPlayingPoint, { u: 1, v: 0 });
  graphModel.playingPoint = resolvedPlayingPoint;

  return {
    label: topology.label,
    graph: graphModel.toGraphData(),
    freeNodeCount,
  };
}

function enforceFreeNodeTarget(
  graphModel: ReturnType<typeof generateGraph>,
  targetFreeNodes: number,
): number {
  const freeIndices: number[] = [];
  for (let i = 0; i < graphModel.dots.length; i += 1) {
    if (!graphModel.dots[i].fixed) {
      freeIndices.push(i);
    }
  }

  if (freeIndices.length <= targetFreeNodes) {
    return freeIndices.length;
  }

  const centerX = CANVAS_WIDTH / 2;
  const centerY = CANVAS_HEIGHT / 2;
  const sortedByCenterDistance = [...freeIndices].sort((a, b) => {
    const da = graphModel.getDot(a);
    const db = graphModel.getDot(b);
    if (!da || !db) {
      return 0;
    }
    return Math.hypot(da.x - centerX, da.y - centerY) - Math.hypot(db.x - centerX, db.y - centerY);
  });

  const keep = new Set(sortedByCenterDistance.slice(0, targetFreeNodes));
  for (const index of freeIndices) {
    if (!keep.has(index)) {
      graphModel.setDotFixed(index, true);
    }
  }

  return targetFreeNodes;
}

describe("note generation benchmark", () => {
  for (const topology of preparedTopologies) {
    for (const backend of BENCH_BACKENDS) {
      for (const method of METHODS) {
        for (const precision of PRECISIONS) {
          const name =
            `topology=${topology.label};backend=${backend};method=${method};precision=${precision};`
            + `durationMs=${DURATION_MS};freeNodes=${topology.freeNodeCount}`;
          bench(name, () => {
            runSimulation(
              topology.graph,
              {
                ...BASE_PARAMS,
                method,
                playingPoint: topology.graph.playingPoint,
              },
              undefined,
              {
                capture: "playing-point-only",
                backend,
                precision,
              },
            );
          });
        }
      }
    }
  }
});
