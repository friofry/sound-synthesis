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
import {
  compileGraph as compileGraphWasmSimd,
  runSimulationWasmSimd,
} from "./simulationOptimized8WasmSimd";
import {
  compileGraph as compileGraphWasmSimdPacked,
  runSimulationWasmSimdPacked,
} from "./simulationOptimized9WasmSimdPacked";
import {
  compileGraph as compileGraphWasmSimdIntrinsics,
  runSimulationWasmSimdIntrinsics,
} from "./simulationOptimized10WasmSimdIntrinsics";
import {
  compileGraph as compileGraphWasmCsrF32,
  runSimulationWasmCsrF32,
} from "./simulationOptimized12WasmCsrF32";
import type { GraphData, GridParams, SimMethod, SimulationBackend, SimulationParams, SimulationPrecision } from "./types";

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
const compiledGraphWasmSimd64 = compileGraphWasmSimd(graph, BASE_PARAMS, 64);
const compiledGraphWasmSimd32 = compileGraphWasmSimd(graph, BASE_PARAMS, 32);
const compiledGraphWasmSimdPacked64 = compileGraphWasmSimdPacked(graph, BASE_PARAMS, 64);
const compiledGraphWasmSimdPacked32 = compileGraphWasmSimdPacked(graph, BASE_PARAMS, 32);
const compiledGraphWasmSimdIntrinsics64 = compileGraphWasmSimdIntrinsics(graph, BASE_PARAMS, 64);
const compiledGraphWasmSimdIntrinsics32 = compileGraphWasmSimdIntrinsics(graph, BASE_PARAMS, 32);
const compiledGraphWasmCsrF32 = compileGraphWasmCsrF32(graph, BASE_PARAMS);

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

function generateNoteWasmSimdPrecompiled(method: SimMethod, precision: SimulationPrecision = 64): Float32Array {
  const compiledGraphWasmSimd = precision === 32 ? compiledGraphWasmSimd32 : compiledGraphWasmSimd64;
  const result = runSimulationWasmSimd(
    compiledGraphWasmSimd,
    { ...BASE_PARAMS, method },
    undefined,
    {
      capture: "playing-point-only",
      precision,
    },
  );
  return result.playingPointBuffer;
}

function generateNoteWasmSimdPackedPrecompiled(method: SimMethod, precision: SimulationPrecision = 64): Float32Array {
  const compiledGraphWasmSimdPacked = precision === 32 ? compiledGraphWasmSimdPacked32 : compiledGraphWasmSimdPacked64;
  const result = runSimulationWasmSimdPacked(
    compiledGraphWasmSimdPacked,
    { ...BASE_PARAMS, method },
    undefined,
    {
      capture: "playing-point-only",
      precision,
    },
  );
  return result.playingPointBuffer;
}

function generateNoteWasmSimdIntrinsicsPrecompiled(method: SimMethod, precision: SimulationPrecision = 64): Float32Array {
  const compiledGraphWasmSimdIntrinsics =
    precision === 32 ? compiledGraphWasmSimdIntrinsics32 : compiledGraphWasmSimdIntrinsics64;
  const result = runSimulationWasmSimdIntrinsics(
    compiledGraphWasmSimdIntrinsics,
    { ...BASE_PARAMS, method },
    undefined,
    {
      capture: "playing-point-only",
      precision,
    },
  );
  return result.playingPointBuffer;
}

function generateNoteWasmCsrF32Precompiled(method: SimMethod): Float32Array {
  const result = runSimulationWasmCsrF32(
    compiledGraphWasmCsrF32,
    { ...BASE_PARAMS, method },
    undefined,
    {
      capture: "playing-point-only",
    },
  );
  return result.playingPointBuffer;
}

describe("note generation benchmark", () => {
  bench("25x25 grid, center impulse, center read, 20ms, Euler-Cramer (legacy)", () => {
    generateNote("euler", "legacy");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Euler-Cramer (optimized)", () => {
    generateNote("euler", "optimized");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Euler-Cramer (edge-list)", () => {
    generateNote("euler", "edge-list");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Euler-Cramer (edge-types)", () => {
    generateNote("euler", "edge-types");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Euler-Cramer (compiled)", () => {
    generateNote("euler", "compiled");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Euler-Cramer (compiled-precompiled)", () => {
    generateNotePrecompiled("euler");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Euler-Cramer (fused-loop)", () => {
    generateNote("euler", "fused-loop");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Euler-Cramer (fused-loop-precompiled)", () => {
    generateNoteFusedPrecompiled("euler");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Euler-Cramer (fused-loop-f32)", () => {
    generateNote("euler", "fused-loop", 32);
  });

  bench("25x25 grid, center impulse, center read, 20ms, Euler-Cramer (fused-loop-precompiled-f32)", () => {
    generateNoteFusedPrecompiled("euler", 32);
  });

  bench("25x25 grid, center impulse, center read, 20ms, Euler-Cramer (sorted-edge-csr)", () => {
    generateNote("euler", "sorted-edge-csr");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Euler-Cramer (sorted-edge-csr-precompiled)", () => {
    generateNoteSortedEdgeCSRPrecompiled("euler");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Euler-Cramer (wasm-hotloop)", () => {
    generateNote("euler", "wasm-hotloop");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Euler-Cramer (wasm-hotloop-precompiled)", () => {
    generateNoteWasmPrecompiled("euler");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Euler-Cramer (wasm-hotloop-f32)", () => {
    generateNote("euler", "wasm-hotloop", 32);
  });

  bench("25x25 grid, center impulse, center read, 20ms, Euler-Cramer (wasm-hotloop-precompiled-f32)", () => {
    generateNoteWasmPrecompiled("euler", 32);
  });

  bench("25x25 grid, center impulse, center read, 20ms, Euler-Cramer (wasm-hotloop-simd)", () => {
    generateNote("euler", "wasm-hotloop-simd");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Euler-Cramer (wasm-hotloop-simd-precompiled)", () => {
    generateNoteWasmSimdPrecompiled("euler");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Euler-Cramer (wasm-hotloop-simd-f32)", () => {
    generateNote("euler", "wasm-hotloop-simd", 32);
  });

  bench("25x25 grid, center impulse, center read, 20ms, Euler-Cramer (wasm-hotloop-simd-precompiled-f32)", () => {
    generateNoteWasmSimdPrecompiled("euler", 32);
  });

  bench("25x25 grid, center impulse, center read, 20ms, Euler-Cramer (wasm-hotloop-simd-packed)", () => {
    generateNote("euler", "wasm-hotloop-simd-packed");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Euler-Cramer (wasm-hotloop-simd-packed-precompiled)", () => {
    generateNoteWasmSimdPackedPrecompiled("euler");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Euler-Cramer (wasm-hotloop-simd-packed-f32)", () => {
    generateNote("euler", "wasm-hotloop-simd-packed", 32);
  });

  bench("25x25 grid, center impulse, center read, 20ms, Euler-Cramer (wasm-hotloop-simd-packed-precompiled-f32)", () => {
    generateNoteWasmSimdPackedPrecompiled("euler", 32);
  });

  bench("25x25 grid, center impulse, center read, 20ms, Euler-Cramer (wasm-hotloop-simd-intrinsics)", () => {
    generateNote("euler", "wasm-hotloop-simd-intrinsics");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Euler-Cramer (wasm-hotloop-simd-intrinsics-precompiled)", () => {
    generateNoteWasmSimdIntrinsicsPrecompiled("euler");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Euler-Cramer (wasm-hotloop-simd-intrinsics-f32)", () => {
    generateNote("euler", "wasm-hotloop-simd-intrinsics", 32);
  });

  bench(
    "25x25 grid, center impulse, center read, 20ms, Euler-Cramer (wasm-hotloop-simd-intrinsics-precompiled-f32)",
    () => {
      generateNoteWasmSimdIntrinsicsPrecompiled("euler", 32);
    },
  );

  bench("25x25 grid, center impulse, center read, 20ms, Euler-Cramer (csr-layout-hybrid)", () => {
    generateNote("euler", "csr-layout-hybrid");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Euler-Cramer (csr-layout-hybrid-f32)", () => {
    generateNote("euler", "csr-layout-hybrid", 32);
  });

  bench("25x25 grid, center impulse, center read, 20ms, Euler-Cramer (wasm-csr-f32)", () => {
    generateNote("euler", "wasm-csr-f32");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Euler-Cramer (wasm-csr-f32-precompiled)", () => {
    generateNoteWasmCsrF32Precompiled("euler");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Runge-Kutta (legacy)", () => {
    generateNote("runge-kutta", "legacy");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Runge-Kutta (optimized)", () => {
    generateNote("runge-kutta", "optimized");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Runge-Kutta (edge-list)", () => {
    generateNote("runge-kutta", "edge-list");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Runge-Kutta (edge-types)", () => {
    generateNote("runge-kutta", "edge-types");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Runge-Kutta (compiled)", () => {
    generateNote("runge-kutta", "compiled");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Runge-Kutta (compiled-precompiled)", () => {
    generateNotePrecompiled("runge-kutta");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Runge-Kutta (fused-loop)", () => {
    generateNote("runge-kutta", "fused-loop");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Runge-Kutta (fused-loop-precompiled)", () => {
    generateNoteFusedPrecompiled("runge-kutta");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Runge-Kutta (fused-loop-f32)", () => {
    generateNote("runge-kutta", "fused-loop", 32);
  });

  bench("25x25 grid, center impulse, center read, 20ms, Runge-Kutta (fused-loop-precompiled-f32)", () => {
    generateNoteFusedPrecompiled("runge-kutta", 32);
  });

  bench("25x25 grid, center impulse, center read, 20ms, Runge-Kutta (sorted-edge-csr)", () => {
    generateNote("runge-kutta", "sorted-edge-csr");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Runge-Kutta (sorted-edge-csr-precompiled)", () => {
    generateNoteSortedEdgeCSRPrecompiled("runge-kutta");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Runge-Kutta (wasm-hotloop)", () => {
    generateNote("runge-kutta", "wasm-hotloop");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Runge-Kutta (wasm-hotloop-precompiled)", () => {
    generateNoteWasmPrecompiled("runge-kutta");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Runge-Kutta (wasm-hotloop-f32)", () => {
    generateNote("runge-kutta", "wasm-hotloop", 32);
  });

  bench("25x25 grid, center impulse, center read, 20ms, Runge-Kutta (wasm-hotloop-precompiled-f32)", () => {
    generateNoteWasmPrecompiled("runge-kutta", 32);
  });

  bench("25x25 grid, center impulse, center read, 20ms, Runge-Kutta (wasm-hotloop-simd)", () => {
    generateNote("runge-kutta", "wasm-hotloop-simd");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Runge-Kutta (wasm-hotloop-simd-precompiled)", () => {
    generateNoteWasmSimdPrecompiled("runge-kutta");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Runge-Kutta (wasm-hotloop-simd-f32)", () => {
    generateNote("runge-kutta", "wasm-hotloop-simd", 32);
  });

  bench("25x25 grid, center impulse, center read, 20ms, Runge-Kutta (wasm-hotloop-simd-precompiled-f32)", () => {
    generateNoteWasmSimdPrecompiled("runge-kutta", 32);
  });

  bench("25x25 grid, center impulse, center read, 20ms, Runge-Kutta (wasm-hotloop-simd-packed)", () => {
    generateNote("runge-kutta", "wasm-hotloop-simd-packed");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Runge-Kutta (wasm-hotloop-simd-packed-precompiled)", () => {
    generateNoteWasmSimdPackedPrecompiled("runge-kutta");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Runge-Kutta (wasm-hotloop-simd-packed-f32)", () => {
    generateNote("runge-kutta", "wasm-hotloop-simd-packed", 32);
  });

  bench(
    "25x25 grid, center impulse, center read, 20ms, Runge-Kutta (wasm-hotloop-simd-packed-precompiled-f32)",
    () => {
      generateNoteWasmSimdPackedPrecompiled("runge-kutta", 32);
    },
  );

  bench("25x25 grid, center impulse, center read, 20ms, Runge-Kutta (wasm-hotloop-simd-intrinsics)", () => {
    generateNote("runge-kutta", "wasm-hotloop-simd-intrinsics");
  });

  bench(
    "25x25 grid, center impulse, center read, 20ms, Runge-Kutta (wasm-hotloop-simd-intrinsics-precompiled)",
    () => {
      generateNoteWasmSimdIntrinsicsPrecompiled("runge-kutta");
    },
  );

  bench("25x25 grid, center impulse, center read, 20ms, Runge-Kutta (wasm-hotloop-simd-intrinsics-f32)", () => {
    generateNote("runge-kutta", "wasm-hotloop-simd-intrinsics", 32);
  });

  bench(
    "25x25 grid, center impulse, center read, 20ms, Runge-Kutta (wasm-hotloop-simd-intrinsics-precompiled-f32)",
    () => {
      generateNoteWasmSimdIntrinsicsPrecompiled("runge-kutta", 32);
    },
  );

  bench("25x25 grid, center impulse, center read, 20ms, Runge-Kutta (csr-layout-hybrid)", () => {
    generateNote("runge-kutta", "csr-layout-hybrid");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Runge-Kutta (csr-layout-hybrid-f32)", () => {
    generateNote("runge-kutta", "csr-layout-hybrid", 32);
  });

  bench("25x25 grid, center impulse, center read, 20ms, Runge-Kutta (wasm-csr-f32)", () => {
    generateNote("runge-kutta", "wasm-csr-f32");
  });

  bench("25x25 grid, center impulse, center read, 20ms, Runge-Kutta (wasm-csr-f32-precompiled)", () => {
    generateNoteWasmCsrF32Precompiled("runge-kutta");
  });
});

describe("simulation capture-mode hotspot benchmark", () => {
  bench("wasm-hotloop-simd-intrinsics, euler, playing-point-only", () => {
    runSimulation(graph, { ...BASE_PARAMS, method: "euler" }, undefined, {
      capture: "playing-point-only",
      backend: "wasm-hotloop-simd-intrinsics",
      precision: 32,
    });
  });

  bench("wasm-hotloop-simd-intrinsics, euler, full", () => {
    runSimulation(graph, { ...BASE_PARAMS, method: "euler" }, undefined, {
      capture: "full",
      backend: "wasm-hotloop-simd-intrinsics",
      precision: 32,
    });
  });

  bench("wasm-csr-f32, euler, playing-point-only", () => {
    runSimulation(graph, { ...BASE_PARAMS, method: "euler" }, undefined, {
      capture: "playing-point-only",
      backend: "wasm-csr-f32",
    });
  });

  bench("wasm-csr-f32, euler, full", () => {
    runSimulation(graph, { ...BASE_PARAMS, method: "euler" }, undefined, {
      capture: "full",
      backend: "wasm-csr-f32",
    });
  });
});
