import { bench, describe } from "vitest";
import { generateGraph } from "./gridGenerators";
import { runSimulation } from "./simulation";
import { compileGraph, runSimulationCompiled } from "./simulationOptimized4Compiled";
import { compileGraph as compileGraphFused, runSimulationFusedLoop } from "./simulationOptimized5FusedLoop";
import {
  compileGraph as compileGraphSortedEdgeCSR,
  runSimulationSortedEdgeCSR,
} from "./simulationOptimized6SortedEdgeCSR";
import {
  compileGraph as compileGraphWasm,
  runSimulationWasm,
} from "./simulationOptimized7Wasm";
import type { GraphData, GridParams, SimMethod, SimulationBackend, SimulationParams, SimulationPrecision } from "./types";

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
const compiledGraph = compileGraph(graph, BASE_PARAMS);
const compiledGraphFused64 = compileGraphFused(graph, BASE_PARAMS, 64);
const compiledGraphFused32 = compileGraphFused(graph, BASE_PARAMS, 32);
const compiledGraphSortedEdgeCSR = compileGraphSortedEdgeCSR(graph, BASE_PARAMS);
const compiledGraphWasm64 = compileGraphWasm(graph, BASE_PARAMS, 64);
const compiledGraphWasm32 = compileGraphWasm(graph, BASE_PARAMS, 32);

function buildCenteredImpulseGraph(): GraphData {
  const next = generateGraph("cell", GRID_PARAMS);
  next.setDotProps(CENTER_INDEX, { u: 1, v: 0 });
  next.playingPoint = CENTER_INDEX;
  return next.toGraphData();
}

function generateNote(method: SimMethod, backend: SimulationBackend, precision: SimulationPrecision = 64): Float32Array {
  const result = runSimulation(graph, { ...BASE_PARAMS, method }, undefined, {
    capture: "playing-point-only",
    backend,
    precision,
  });
  return result.playingPointBuffer;
}

function generateNotePrecompiled(method: SimMethod): Float32Array {
  const result = runSimulationCompiled(
    compiledGraph,
    { ...BASE_PARAMS, method },
    undefined,
    {
      capture: "playing-point-only",
    },
  );
  return result.playingPointBuffer;
}

function generateNoteFusedPrecompiled(method: SimMethod, precision: SimulationPrecision = 64): Float32Array {
  const compiledGraphFused = precision === 32 ? compiledGraphFused32 : compiledGraphFused64;
  const result = runSimulationFusedLoop(
    compiledGraphFused,
    { ...BASE_PARAMS, method },
    undefined,
    {
      capture: "playing-point-only",
      precision,
    },
  );
  return result.playingPointBuffer;
}

function generateNoteSortedEdgeCSRPrecompiled(method: SimMethod): Float32Array {
  const result = runSimulationSortedEdgeCSR(
    compiledGraphSortedEdgeCSR,
    { ...BASE_PARAMS, method },
    undefined,
    {
      capture: "playing-point-only",
    },
  );
  return result.playingPointBuffer;
}

function generateNoteWasmPrecompiled(method: SimMethod, precision: SimulationPrecision = 64): Float32Array {
  const compiledGraphWasm = precision === 32 ? compiledGraphWasm32 : compiledGraphWasm64;
  const result = runSimulationWasm(
    compiledGraphWasm,
    { ...BASE_PARAMS, method },
    undefined,
    {
      capture: "playing-point-only",
      precision,
    },
  );
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

  bench("25x25 grid, center impulse, center read, 150ms, Euler-Cramer (compiled)", () => {
    generateNote("euler", "compiled");
  });

  bench("25x25 grid, center impulse, center read, 150ms, Euler-Cramer (compiled-precompiled)", () => {
    generateNotePrecompiled("euler");
  });

  bench("25x25 grid, center impulse, center read, 150ms, Euler-Cramer (fused-loop)", () => {
    generateNote("euler", "fused-loop");
  });

  bench("25x25 grid, center impulse, center read, 150ms, Euler-Cramer (fused-loop-precompiled)", () => {
    generateNoteFusedPrecompiled("euler");
  });

  bench("25x25 grid, center impulse, center read, 150ms, Euler-Cramer (fused-loop-f32)", () => {
    generateNote("euler", "fused-loop", 32);
  });

  bench("25x25 grid, center impulse, center read, 150ms, Euler-Cramer (fused-loop-precompiled-f32)", () => {
    generateNoteFusedPrecompiled("euler", 32);
  });

  bench("25x25 grid, center impulse, center read, 150ms, Euler-Cramer (sorted-edge-csr)", () => {
    generateNote("euler", "sorted-edge-csr");
  });

  bench("25x25 grid, center impulse, center read, 150ms, Euler-Cramer (sorted-edge-csr-precompiled)", () => {
    generateNoteSortedEdgeCSRPrecompiled("euler");
  });

  bench("25x25 grid, center impulse, center read, 150ms, Euler-Cramer (wasm-hotloop)", () => {
    generateNote("euler", "wasm-hotloop");
  });

  bench("25x25 grid, center impulse, center read, 150ms, Euler-Cramer (wasm-hotloop-precompiled)", () => {
    generateNoteWasmPrecompiled("euler");
  });

  bench("25x25 grid, center impulse, center read, 150ms, Euler-Cramer (wasm-hotloop-f32)", () => {
    generateNote("euler", "wasm-hotloop", 32);
  });

  bench("25x25 grid, center impulse, center read, 150ms, Euler-Cramer (wasm-hotloop-precompiled-f32)", () => {
    generateNoteWasmPrecompiled("euler", 32);
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

  bench("25x25 grid, center impulse, center read, 150ms, Runge-Kutta (compiled)", () => {
    generateNote("runge-kutta", "compiled");
  });

  bench("25x25 grid, center impulse, center read, 150ms, Runge-Kutta (compiled-precompiled)", () => {
    generateNotePrecompiled("runge-kutta");
  });

  bench("25x25 grid, center impulse, center read, 150ms, Runge-Kutta (fused-loop)", () => {
    generateNote("runge-kutta", "fused-loop");
  });

  bench("25x25 grid, center impulse, center read, 150ms, Runge-Kutta (fused-loop-precompiled)", () => {
    generateNoteFusedPrecompiled("runge-kutta");
  });

  bench("25x25 grid, center impulse, center read, 150ms, Runge-Kutta (fused-loop-f32)", () => {
    generateNote("runge-kutta", "fused-loop", 32);
  });

  bench("25x25 grid, center impulse, center read, 150ms, Runge-Kutta (fused-loop-precompiled-f32)", () => {
    generateNoteFusedPrecompiled("runge-kutta", 32);
  });

  bench("25x25 grid, center impulse, center read, 150ms, Runge-Kutta (sorted-edge-csr)", () => {
    generateNote("runge-kutta", "sorted-edge-csr");
  });

  bench("25x25 grid, center impulse, center read, 150ms, Runge-Kutta (sorted-edge-csr-precompiled)", () => {
    generateNoteSortedEdgeCSRPrecompiled("runge-kutta");
  });

  bench("25x25 grid, center impulse, center read, 150ms, Runge-Kutta (wasm-hotloop)", () => {
    generateNote("runge-kutta", "wasm-hotloop");
  });

  bench("25x25 grid, center impulse, center read, 150ms, Runge-Kutta (wasm-hotloop-precompiled)", () => {
    generateNoteWasmPrecompiled("runge-kutta");
  });

  bench("25x25 grid, center impulse, center read, 150ms, Runge-Kutta (wasm-hotloop-f32)", () => {
    generateNote("runge-kutta", "wasm-hotloop", 32);
  });

  bench("25x25 grid, center impulse, center read, 150ms, Runge-Kutta (wasm-hotloop-precompiled-f32)", () => {
    generateNoteWasmPrecompiled("runge-kutta", 32);
  });
});
