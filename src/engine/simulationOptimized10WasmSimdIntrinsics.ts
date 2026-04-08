import type { GraphData, SimulationCaptureMode, SimulationParams, SimulationPrecision, SimulationResult, SimulationState } from "./types";
import {
  compileGraphPacked,
  createWasmSimdPackedRuntimeStepper,
  runSimulationWasmSimdPacked,
  type CompiledSimulationGraph,
  type RuntimeSimulationStepper as WasmSimdPackedRuntimeSimulationStepper,
} from "./simulationOptimized9WasmSimdPacked";

type RunSimulationOptions = {
  capture?: SimulationCaptureMode;
  precision?: SimulationPrecision;
};

export type RuntimeSimulationStepper = {
  state: SimulationState;
  step: (steps?: number) => void;
};

// This generation keeps the same runtime surface and graph packing as v9,
// while reserving a dedicated backend slot for future direct SIMD intrinsics kernels.
export { compileGraphPacked as compileGraph };
export type { CompiledSimulationGraph };

export function runSimulationWasmSimdIntrinsics(
  compiled: CompiledSimulationGraph,
  params: SimulationParams,
  onProgress?: (completed: number, total: number) => void,
  options?: RunSimulationOptions,
): SimulationResult {
  return runSimulationWasmSimdPacked(compiled, params, onProgress, options);
}

export function runSimulationWasmSimdIntrinsicsBackend(
  graph: GraphData,
  params: SimulationParams,
  onProgress?: (completed: number, total: number) => void,
  options?: RunSimulationOptions,
): SimulationResult {
  const compiled = compileGraphPacked(graph, params, options?.precision ?? 64);
  return runSimulationWasmSimdIntrinsics(compiled, params, onProgress, options);
}

export function createWasmSimdIntrinsicsRuntimeStepper(
  compiled: CompiledSimulationGraph,
  params: SimulationParams,
): RuntimeSimulationStepper {
  return createWasmSimdPackedRuntimeStepper(compiled, params) as WasmSimdPackedRuntimeSimulationStepper;
}

export function createWasmSimdIntrinsicsRuntimeStepperBackend(
  graph: GraphData,
  params: SimulationParams,
): RuntimeSimulationStepper {
  const compiled = compileGraphPacked(graph, params);
  return createWasmSimdIntrinsicsRuntimeStepper(compiled, params);
}
