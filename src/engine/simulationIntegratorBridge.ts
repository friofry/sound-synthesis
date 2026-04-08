import type { SimulationParams } from "./types";

export function createIntegratorStep(
  method: SimulationParams["method"],
  stepEuler: (stepDt: number) => void,
  stepRungeKutta: (stepDt: number) => void,
): (stepDt: number) => void {
  return method === "runge-kutta" ? stepRungeKutta : stepEuler;
}
