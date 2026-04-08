import type {
  FloatArray,
  GraphData,
  SimulationCaptureMode,
  SimulationParams,
  SimulationPrecision,
  SimulationResult,
  SimulationState,
} from "./types";
import {
  createWasmSimdRuntimeStepper,
  runSimulationWasmSimd,
  type RuntimeSimulationStepper as WasmSimdRuntimeSimulationStepper,
} from "./simulationOptimized8WasmSimd";
import type { CompiledSimulationGraph } from "./simulationOptimized5FusedLoop";

type RunSimulationOptions = {
  capture?: SimulationCaptureMode;
  precision?: SimulationPrecision;
};

type FreeNodeMapping = {
  freeToGlobal: Uint32Array;
  globalToFree: Int32Array;
  initialU: FloatArray;
  initialV: FloatArray;
};

type FreeFreeEdges = CompiledSimulationGraph["edges"]["freeFree"];
type FreeFixedEdges = CompiledSimulationGraph["edges"]["freeFixed"];

export type RuntimeSimulationStepper = {
  state: SimulationState;
  step: (steps?: number) => void;
};

function toFloatArray(values: number[], precision: SimulationPrecision): FloatArray {
  return precision === 32 ? Float32Array.from(values) : Float64Array.from(values);
}

function createFreeNodeMappingPacked(graph: GraphData, precision: SimulationPrecision): FreeNodeMapping {
  const globalToFree = new Int32Array(graph.dots.length);
  globalToFree.fill(-1);

  const freeGlobals: number[] = [];
  for (let globalIndex = 0; globalIndex < graph.dots.length; globalIndex += 1) {
    if (!graph.dots[globalIndex].fixed) {
      freeGlobals.push(globalIndex);
    }
  }

  const adjacency = new Map<number, number[]>();
  for (const g of freeGlobals) {
    adjacency.set(g, []);
  }
  for (const line of graph.lines) {
    const d1 = graph.dots[line.dot1];
    const d2 = graph.dots[line.dot2];
    if (!d1 || !d2 || d1.fixed || d2.fixed) {
      continue;
    }
    adjacency.get(line.dot1)?.push(line.dot2);
    adjacency.get(line.dot2)?.push(line.dot1);
  }

  const orderedFreeGlobals: number[] = [];
  const visited = new Set<number>();
  const sortedSeeds = [...freeGlobals].sort((a, b) => a - b);
  for (const seed of sortedSeeds) {
    if (visited.has(seed)) {
      continue;
    }
    const queue: number[] = [seed];
    visited.add(seed);
    while (queue.length > 0) {
      const current = queue.shift()!;
      orderedFreeGlobals.push(current);
      const neighbors = adjacency.get(current) ?? [];
      neighbors.sort((a, b) => a - b);
      for (const next of neighbors) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
  }

  const initialU: number[] = [];
  const initialV: number[] = [];
  for (let freeIndex = 0; freeIndex < orderedFreeGlobals.length; freeIndex += 1) {
    const globalIndex = orderedFreeGlobals[freeIndex];
    globalToFree[globalIndex] = freeIndex;
    initialU.push(graph.dots[globalIndex].u);
    initialV.push(graph.dots[globalIndex].v);
  }

  return {
    freeToGlobal: Uint32Array.from(orderedFreeGlobals),
    globalToFree,
    initialU: toFloatArray(initialU, precision),
    initialV: toFloatArray(initialV, precision),
  };
}

function createPackedEdges(
  graph: GraphData,
  globalToFree: Int32Array,
  precision: SimulationPrecision,
): { freeFree: FreeFreeEdges; freeFixed: FreeFixedEdges } {
  const edgeI: number[] = [];
  const edgeJ: number[] = [];
  const kOverMassI: number[] = [];
  const kOverMassJ: number[] = [];
  const fixedDiag = new Map<number, number>();

  for (const line of graph.lines) {
    const d1 = graph.dots[line.dot1];
    const d2 = graph.dots[line.dot2];
    if (!d1 || !d2) {
      continue;
    }

    if (!d1.fixed && !d2.fixed) {
      edgeI.push(globalToFree[line.dot1]);
      edgeJ.push(globalToFree[line.dot2]);
      kOverMassI.push(line.k / d1.weight);
      kOverMassJ.push(line.k / d2.weight);
      continue;
    }

    if (!d1.fixed) {
      const idx = globalToFree[line.dot1];
      fixedDiag.set(idx, (fixedDiag.get(idx) ?? 0) - line.k / d1.weight);
    }
    if (!d2.fixed) {
      const idx = globalToFree[line.dot2];
      fixedDiag.set(idx, (fixedDiag.get(idx) ?? 0) - line.k / d2.weight);
    }
  }

  const fixedEntries = [...fixedDiag.entries()].sort((a, b) => a[0] - b[0]);
  const freeIndex = Uint32Array.from(fixedEntries.map(([index]) => index));
  const kOverMass = toFloatArray(
    fixedEntries.map(([, value]) => value),
    precision,
  );

  return {
    freeFree: {
      edgeI: Uint32Array.from(edgeI),
      edgeJ: Uint32Array.from(edgeJ),
      kOverMassI: toFloatArray(kOverMassI, precision),
      kOverMassJ: toFloatArray(kOverMassJ, precision),
    },
    freeFixed: {
      freeIndex,
      kOverMass,
    },
  };
}

export function compileGraphPacked(
  graph: GraphData,
  params: Pick<SimulationParams, "playingPoint">,
  precision: SimulationPrecision = 64,
): CompiledSimulationGraph {
  const totalDots = graph.dots.length;
  const mapping = createFreeNodeMappingPacked(graph, precision);
  const edges = createPackedEdges(graph, mapping.globalToFree, precision);
  const playingPointGlobal = Math.max(0, Math.min(totalDots - 1, graph.playingPoint ?? params.playingPoint));
  const playingPointFree = mapping.globalToFree[playingPointGlobal];

  return {
    totalDots,
    freeCount: mapping.freeToGlobal.length,
    freeToGlobal: mapping.freeToGlobal,
    globalToFree: mapping.globalToFree,
    initialU: mapping.initialU,
    initialV: mapping.initialV,
    edges,
    playingPointGlobal,
    playingPointFree,
  };
}

export { compileGraphPacked as compileGraph };
export type { CompiledSimulationGraph };

export function runSimulationWasmSimdPacked(
  compiled: CompiledSimulationGraph,
  params: SimulationParams,
  onProgress?: (completed: number, total: number) => void,
  options?: RunSimulationOptions,
): SimulationResult {
  return runSimulationWasmSimd(compiled, params, onProgress, options);
}

export function runSimulationWasmSimdPackedBackend(
  graph: GraphData,
  params: SimulationParams,
  onProgress?: (completed: number, total: number) => void,
  options?: RunSimulationOptions,
): SimulationResult {
  const compiled = compileGraphPacked(graph, params, options?.precision ?? 64);
  return runSimulationWasmSimdPacked(compiled, params, onProgress, options);
}

export function createWasmSimdPackedRuntimeStepper(
  compiled: CompiledSimulationGraph,
  params: SimulationParams,
): RuntimeSimulationStepper {
  return createWasmSimdRuntimeStepper(compiled, params) as WasmSimdRuntimeSimulationStepper;
}

export function createWasmSimdPackedRuntimeStepperBackend(
  graph: GraphData,
  params: SimulationParams,
): RuntimeSimulationStepper {
  const compiled = compileGraphPacked(graph, params);
  return createWasmSimdPackedRuntimeStepper(compiled, params);
}
