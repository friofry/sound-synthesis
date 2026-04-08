import type { SimMethod, SimulationBackend, SimulationPrecision, SimulationSubstepsMode } from "./types";

export const LEGACY_SIMULATION_BACKEND: SimulationBackend = "legacy";
export const DEFAULT_SIMULATION_METHOD: SimMethod = "euler";
export const DEFAULT_SIMULATION_BACKEND: SimulationBackend = "wasm-hotloop-simd";
export const DEFAULT_SIMULATION_PRECISION: SimulationPrecision = 64;
export const DEFAULT_SIMULATION_SUBSTEPS_MODE: SimulationSubstepsMode = "fixed";
export const DEFAULT_SIMULATION_SUBSTEPS = 1;

export function resolveDefaultSimulationBackend(
  method: SimMethod = DEFAULT_SIMULATION_METHOD,
  precision: SimulationPrecision = DEFAULT_SIMULATION_PRECISION,
): SimulationBackend {
  if (method === "euler" && precision === 32) {
    return "wasm-hotloop";
  }
  if (method === "euler" && precision === 64) {
    return "wasm-hotloop-simd";
  }
  if (method === "runge-kutta" && precision === 32) {
    return "csr-layout-hybrid";
  }
  return "wasm-hotloop-simd-packed";
}

export const DEFAULT_SIMULATION_PROFILE = {
  method: DEFAULT_SIMULATION_METHOD,
  backend: resolveDefaultSimulationBackend(DEFAULT_SIMULATION_METHOD, DEFAULT_SIMULATION_PRECISION),
  precision: DEFAULT_SIMULATION_PRECISION,
  substepsMode: DEFAULT_SIMULATION_SUBSTEPS_MODE,
  substeps: DEFAULT_SIMULATION_SUBSTEPS,
} as const;

export const CI_BENCHMARK_BACKENDS: readonly SimulationBackend[] = [
  LEGACY_SIMULATION_BACKEND,
  DEFAULT_SIMULATION_BACKEND,
] as const;
