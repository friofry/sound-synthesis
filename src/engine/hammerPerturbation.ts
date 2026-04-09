import type { HammerSettings } from "../store/graphStore";
import type { GraphPerturbation } from "./types";
import { createZeroPerturbation, GraphModel } from "./graph";

type HammerPerturbationOptions = {
  graph: GraphModel;
  impactX: number;
  impactY: number;
  charge: number;
  settings: Pick<HammerSettings, "distribution" | "weight" | "velocity" | "restitution" | "radius">;
};

export function createHammerToolPerturbation(options: HammerPerturbationOptions): GraphPerturbation {
  const perturbation = createZeroPerturbation(options.graph.dots.length);
  const radius = Math.max(1, options.settings.radius);
  const hammerMass = Math.max(0.000001, options.settings.weight);
  const restitution = clamp(options.settings.restitution, 0, 1);
  const effectiveVelocity = options.settings.velocity * clamp(options.charge, 0, 1);

  for (let index = 0; index < options.graph.dots.length; index += 1) {
    const dot = options.graph.dots[index];
    if (!dot || dot.fixed) {
      continue;
    }
    const dist = Math.hypot(dot.x - options.impactX, dot.y - options.impactY);
    if (dist > radius) {
      continue;
    }
    const factor = options.settings.distribution === "smoothed" ? Math.max(0, 1 - dist / radius) : 1;
    const dotMass = Math.max(0.000001, dot.weight);
    const impactVelocity = (((1 + restitution) * hammerMass) / (hammerMass + dotMass)) * effectiveVelocity * factor;
    perturbation.points[index] = {
      u: 0,
      v: impactVelocity,
    };
  }

  return perturbation;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
