import type { RuntimeSimulationStepper } from "../../engine/simulation";

let runtimeStepperAccessor: (() => RuntimeSimulationStepper | null) | null = null;

export function registerMembraneRuntimeAccessor(accessor: (() => RuntimeSimulationStepper | null) | null): void {
  runtimeStepperAccessor = accessor;
}

export function getMembraneRuntimeStepper(): RuntimeSimulationStepper | null {
  return runtimeStepperAccessor?.() ?? null;
}
