import type { SimulationParams } from "./types";

export function normalizeSimulationSubsteps(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  const rounded = Math.round(value ?? 1);
  if (rounded <= 1) return 1;
  if (rounded <= 2) return 2;
  if (rounded <= 4) return 4;
  return 8;
}

export function substepsFromStiffnessRatio(stiffnessRatio: number): number {
  if (stiffnessRatio > 0.12) return 8;
  if (stiffnessRatio > 0.06) return 4;
  if (stiffnessRatio > 0.03) return 2;
  return 1;
}

export function resolveSampleSubsteps(
  params: Pick<SimulationParams, "substeps" | "substepsMode">,
  adaptiveSubsteps: number,
): () => number {
  const fixedSubsteps = normalizeSimulationSubsteps(params.substeps);
  return () => (params.substepsMode === "adaptive" ? adaptiveSubsteps : fixedSubsteps);
}
