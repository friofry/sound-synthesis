import type { HammerSettings } from "../store/graphStore";
import type { GraphPerturbation } from "./types";
import { createZeroPerturbation, GraphModel } from "./graph";

type HammerPerturbationOptions = {
  graph: GraphModel;
  impactX: number;
  impactY: number;
  charge: number;
  settings: Pick<HammerSettings, "distribution" | "weight" | "velocity" | "restitution" | "radius" | "playingPointMode">;
};

export function createHammerToolPerturbation(options: HammerPerturbationOptions): GraphPerturbation {
  const perturbation = createZeroPerturbation(options.graph.dots.length);
  const radius = Math.max(1, options.settings.radius);
  const hammerMass = Math.max(0.000001, options.settings.weight);
  const restitution = clamp(options.settings.restitution, 0, 1);
  const effectiveVelocity = options.settings.velocity * clamp(options.charge, 1, 10);
  const activeDotIndices: number[] = [];

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
    activeDotIndices.push(index);
  }
  perturbation.playingPoint = resolveHammerPlayingPoint(
    options.graph,
    options.impactX,
    options.impactY,
    options.settings.playingPointMode,
    activeDotIndices,
  );

  return perturbation;
}

export function resolveHammerPlayingPoint(
  graph: GraphModel,
  impactX: number,
  impactY: number,
  playingPointMode: HammerSettings["playingPointMode"],
  preferredIndices: number[] = [],
): number {
  return playingPointMode === "graph-center"
    ? findGraphCenterDot(graph)
    : findNearestPlayableDot(graph, impactX, impactY, preferredIndices);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function findNearestPlayableDot(graph: GraphModel, x: number, y: number, preferredIndices: number[]): number {
  if (preferredIndices.length > 0) {
    let bestPreferred = preferredIndices[0];
    let bestDist = Number.POSITIVE_INFINITY;
    for (const index of preferredIndices) {
      const dot = graph.dots[index];
      if (!dot || dot.fixed) {
        continue;
      }
      const dist = Math.hypot(dot.x - x, dot.y - y);
      if (dist < bestDist) {
        bestDist = dist;
        bestPreferred = index;
      }
    }
    return bestPreferred;
  }

  let best = graph.findFirstPlayableDot();
  let bestDist = Number.POSITIVE_INFINITY;
  for (let index = 0; index < graph.dots.length; index += 1) {
    const dot = graph.dots[index];
    if (!dot || dot.fixed) {
      continue;
    }
    const dist = Math.hypot(dot.x - x, dot.y - y);
    if (dist < bestDist) {
      bestDist = dist;
      best = index;
    }
  }
  return best;
}

function findGraphCenterDot(graph: GraphModel): number {
  if (graph.dots.length === 0) {
    return 0;
  }
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const dot of graph.dots) {
    minX = Math.min(minX, dot.x);
    maxX = Math.max(maxX, dot.x);
    minY = Math.min(minY, dot.y);
    maxY = Math.max(maxY, dot.y);
  }
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  return findNearestPlayableDot(graph, centerX, centerY, []);
}
