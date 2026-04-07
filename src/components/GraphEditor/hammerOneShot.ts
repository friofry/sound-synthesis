import { GraphModel } from "../../engine/graph";
import type {
  SimulationBackend,
  SimulationPrecision,
  SimulationWorkerMessage,
  SimulationWorkerRequest,
} from "../../engine/types";
import type { HammerSettings } from "../../store/graphStore";

type HammerOneShotOptions = {
  graph: GraphModel;
  impactX: number;
  impactY: number;
  charge: number;
  settings: HammerSettings;
  sampleRate?: number;
};

type HammerOneShotResult = {
  buffer: Float32Array;
  sampleRate: number;
};

const FIXED_DURATION_MS = 500;
const FIXED_METHOD = "runge-kutta";
const FIXED_BACKEND: SimulationBackend = "wasm-hotloop";
const FIXED_PRECISION: SimulationPrecision = 64;

export async function generateHammerOneShot(options: HammerOneShotOptions): Promise<HammerOneShotResult> {
  const sampleRate = options.sampleRate ?? 44_100;
  const lengthK = resolveLengthK(FIXED_DURATION_MS, sampleRate);
  const graph = options.graph.clone();
  const radius = Math.max(1, options.settings.radius);
  const effectiveAmplitude = Math.max(0, options.settings.amplitude * clamp(options.charge, 0, 1));
  const activeDotIndices: number[] = [];

  for (let index = 0; index < graph.dots.length; index += 1) {
    const dot = graph.dots[index];
    if (!dot || dot.fixed) {
      continue;
    }
    const dist = Math.hypot(dot.x - options.impactX, dot.y - options.impactY);
    if (dist > radius) {
      continue;
    }
    const factor = options.settings.distribution === "smoothed" ? Math.max(0, 1 - dist / radius) : 1;
    graph.setDotProps(index, {
      u: effectiveAmplitude * factor,
      v: options.settings.velocity * factor,
      weight: Math.max(0.000001, options.settings.weight * Math.max(0.1, factor)),
    });
    activeDotIndices.push(index);
  }

  graph.playingPoint =
    options.settings.playingPointMode === "graph-center"
      ? findGraphCenterDot(graph)
      : findNearestPlayableDot(graph, options.impactX, options.impactY, activeDotIndices);

  const response = await runPlayingPointOnly({
    graph: graph.toGraphData(),
    params: {
      sampleRate,
      lengthK,
      method: FIXED_METHOD,
      attenuation: options.settings.attenuation,
      squareAttenuation: options.settings.squareAttenuation,
      playingPoint: graph.playingPoint ?? graph.findFirstPlayableDot(),
    },
    outputMode: "playing-point-only",
    backend: FIXED_BACKEND,
    precision: FIXED_PRECISION,
  });

  return { buffer: response, sampleRate };
}

function runPlayingPointOnly(request: SimulationWorkerRequest): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../../engine/simulation.worker.ts", import.meta.url), { type: "module" });

    worker.onmessage = (event: MessageEvent<SimulationWorkerMessage>) => {
      const message = event.data;
      if (message.type === "progress") {
        return;
      }
      worker.terminate();
      if (message.type === "error") {
        reject(new Error(message.message));
        return;
      }
      if (message.outputMode !== "playing-point-only") {
        reject(new Error("Hammer one-shot worker returned full output unexpectedly"));
        return;
      }
      resolve(message.playingPointBuffer);
    };

    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "Hammer one-shot worker failed"));
    };

    worker.postMessage(request);
  });
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

function resolveLengthK(durationMs: number, sampleRate: number): number {
  const sampleCount = Math.ceil((Math.max(1, durationMs) * sampleRate) / 1000);
  return Math.max(1, Math.ceil(sampleCount / 1024));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
