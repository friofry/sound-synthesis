import type { GraphData, SimulationCaptureMode, SimulationParams, SimulationPrecision, SimulationResult, SimulationState } from "./types";
import {
  createSortedEdgeCSRRuntimeStepperBackend,
  runSimulationSortedEdgeCSRBackend,
  type RuntimeSimulationStepper as SortedEdgeCSRRuntimeSimulationStepper,
} from "./simulationOptimized6SortedEdgeCSR";
import {
  createWasmSimdIntrinsicsRuntimeStepperBackend,
  runSimulationWasmSimdIntrinsicsBackend,
  type RuntimeSimulationStepper as WasmSimdIntrinsicsRuntimeSimulationStepper,
} from "./simulationOptimized10WasmSimdIntrinsics";

type RunSimulationOptions = {
  capture?: SimulationCaptureMode;
  precision?: SimulationPrecision;
};

export type RuntimeSimulationStepper = {
  state: SimulationState;
  step: (steps?: number) => void;
};

export function runSimulationCsrLayoutBackend(
  graph: GraphData,
  params: SimulationParams,
  onProgress?: (completed: number, total: number) => void,
  options?: RunSimulationOptions,
): SimulationResult {
  if ((options?.precision ?? 64) === 32) {
    return runSimulationWasmSimdIntrinsicsBackend(graph, params, onProgress, options);
  }
  return runSimulationSortedEdgeCSRBackend(graph, params, onProgress, options);
}

export function createCsrLayoutRuntimeStepperBackend(
  graph: GraphData,
  params: SimulationParams,
  precision: SimulationPrecision = 64,
): RuntimeSimulationStepper {
  if (precision === 32) {
    return createWasmSimdIntrinsicsRuntimeStepperBackend(graph, params) as WasmSimdIntrinsicsRuntimeSimulationStepper;
  }
  return createSortedEdgeCSRRuntimeStepperBackend(graph, params) as SortedEdgeCSRRuntimeSimulationStepper;
}
