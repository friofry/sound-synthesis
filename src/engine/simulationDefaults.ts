import type { SimMethod, SimulationBackend, SimulationPrecision, SimulationSubstepsMode } from "./types";

export const LEGACY_SIMULATION_BACKEND: SimulationBackend = "legacy";
export const DEFAULT_SIMULATION_METHOD: SimMethod = "euler";
export const DEFAULT_SIMULATION_BACKEND: SimulationBackend = "wasm-csr";
export const DEFAULT_SIMULATION_PRECISION: SimulationPrecision = 64;
export const DEFAULT_SIMULATION_SUBSTEPS_MODE: SimulationSubstepsMode = "fixed";
export const DEFAULT_SIMULATION_SUBSTEPS = 1;

export const DEFAULT_SIMULATION_PROFILE = {
  method: DEFAULT_SIMULATION_METHOD,
  backend: DEFAULT_SIMULATION_BACKEND,
  precision: DEFAULT_SIMULATION_PRECISION,
  substepsMode: DEFAULT_SIMULATION_SUBSTEPS_MODE,
  substeps: DEFAULT_SIMULATION_SUBSTEPS,
} as const;

export const CI_BENCHMARK_BACKENDS: readonly SimulationBackend[] = [
  LEGACY_SIMULATION_BACKEND,
  DEFAULT_SIMULATION_BACKEND,
] as const;
