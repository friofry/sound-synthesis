import type {
  SimulationBackend,
  SimulationCaptureMode,
  SimulationPrecision,
  SimulationState,
} from "./types";

export type RuntimeSimulationStepper = {
  state: SimulationState;
  step: (steps?: number) => void;
};

export type RunSimulationOptions = {
  capture?: SimulationCaptureMode;
  backend?: SimulationBackend;
  precision?: SimulationPrecision;
};
