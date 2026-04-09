import { GraphModel } from "../../engine/graph";
import type { SimulationWorkerMessage, SimulationWorkerRequest } from "../../engine/types";
import type { HammerSettings } from "../../store/graphStore";
import { resolveHammerPlayingPoint } from "../../engine/hammerPerturbation";
import { DEFAULT_HAMMER_ONE_SHOT_SETTINGS } from "../../config/defaults";

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

export async function generateHammerOneShot(options: HammerOneShotOptions): Promise<HammerOneShotResult> {
  const settingsProfile = DEFAULT_HAMMER_ONE_SHOT_SETTINGS;
  const sampleRate = options.sampleRate ?? settingsProfile.sampleRate;
  const lengthK = resolveLengthK(settingsProfile.durationMs, sampleRate, settingsProfile.tillSilence);
  const graph = options.graph.clone();
  const radius = Math.max(1, options.settings.radius);
  const hammerMass = Math.max(0.000001, options.settings.weight);
  const restitution = clamp(options.settings.restitution, 0, 1);
  const effectiveVelocity = options.settings.velocity * clamp(options.charge, 1, 10);
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
    const dotMass = Math.max(0.000001, dot.weight);
    const impactVelocity = (((1 + restitution) * hammerMass) / (hammerMass + dotMass)) * effectiveVelocity * factor;
    graph.setDotProps(index, {
      u: 0,
      v: impactVelocity,
    });
    activeDotIndices.push(index);
  }

  graph.playingPoint = resolveHammerPlayingPoint(
    graph,
    options.impactX,
    options.impactY,
    options.settings.playingPointMode,
    activeDotIndices,
  );

  const response = await runPlayingPointOnly({
    graph: graph.toGraphData(),
    params: {
      sampleRate,
      lengthK,
      method: settingsProfile.method,
      attenuation: options.settings.attenuation,
      squareAttenuation: options.settings.squareAttenuation,
      playingPoint: graph.resolvePlayingPoint(),
      substepsMode: settingsProfile.substepsMode,
      substeps: settingsProfile.substeps,
    },
    outputMode: "playing-point-only",
    backend: settingsProfile.backend,
    precision: settingsProfile.precision,
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

function resolveLengthK(durationMs: number, sampleRate: number, tillSilence: boolean): number {
  const safeDurationMs = Math.max(1, durationMs);
  const effectiveDurationMs = tillSilence ? Math.max(safeDurationMs * 3, 1000) : safeDurationMs;
  const sampleCount = Math.ceil((effectiveDurationMs * sampleRate) / 1000);
  return Math.max(1, Math.ceil(sampleCount / 1024));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
