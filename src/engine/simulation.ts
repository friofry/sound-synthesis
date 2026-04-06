import type {
  GraphData,
  KoeffStr,
  SimulationBackend,
  SimulationCaptureMode,
  SimulationParams,
  SimulationResult,
  SimulationState,
} from "./types";
import {
  createOptimizedRuntimeStepper,
  runSimulationOptimized,
  type RuntimeSimulationStepper as OptimizedRuntimeSimulationStepper,
} from "./simulationOptimized";

const DEFAULT_EDGE_FADE_MS = 2;

type RungeKuttaWorkspace = {
  k1u: Float64Array;
  k1v: Float64Array;
  u2: Float64Array;
  v2: Float64Array;
  u3: Float64Array;
  v3: Float64Array;
  u4: Float64Array;
  v4: Float64Array;
  k2v: Float64Array;
  k3v: Float64Array;
  k4v: Float64Array;
};

type RunSimulationOptions = {
  capture?: SimulationCaptureMode;
  backend?: SimulationBackend;
};

export type RuntimeSimulationStepper = {
  state: SimulationState;
  step: (steps?: number) => void;
};

export function createConnectionStructure(graph: GraphData): KoeffStr[] {
  const coeffs: KoeffStr[] = [];

  const addCoeff = (i: number, j: number, value: number) => {
    if (value !== 0) {
      coeffs.push({ i, j, value });
    }
  };

  for (const line of graph.lines) {
    const d1 = graph.dots[line.dot1];
    const d2 = graph.dots[line.dot2];
    if (!d1 || !d2) {
      continue;
    }

    if (!d1.fixed && !d2.fixed) {
      addCoeff(line.dot1, line.dot1, -line.k / d1.weight);
      addCoeff(line.dot1, line.dot2, line.k / d1.weight);
      addCoeff(line.dot2, line.dot2, -line.k / d2.weight);
      addCoeff(line.dot2, line.dot1, line.k / d2.weight);
      continue;
    }

    if (!d1.fixed) {
      addCoeff(line.dot1, line.dot1, -line.k / d1.weight);
    }
    if (!d2.fixed) {
      addCoeff(line.dot2, line.dot2, -line.k / d2.weight);
    }
  }

  return coeffs;
}

export function multiplySparse(
  n: number,
  vector: Float64Array,
  coeffs: KoeffStr[],
  out?: Float64Array,
): Float64Array {
  const result = out && out.length === n ? out : new Float64Array(n);
  result.fill(0);
  for (const coeff of coeffs) {
    result[coeff.i] += coeff.value * vector[coeff.j];
  }
  return result;
}

export function sqrAnnuation(acceleration: Float64Array, velocity: Float64Array, squareAttenuation: number): void {
  for (let i = 0; i < velocity.length; i += 1) {
    acceleration[i] -= squareAttenuation * Math.abs(velocity[i]) * velocity[i];
  }
}

export function eulerCramerStep(
  state: SimulationState,
  coeffs: KoeffStr[],
  dt: number,
  attenuation: number,
  squareAttenuation = 0,
  springScratch?: Float64Array,
): void {
  const { u, v } = state;
  const spring = multiplySparse(u.length, u, coeffs, springScratch);

  for (let i = 0; i < u.length; i += 1) {
    spring[i] -= attenuation * v[i];
  }
  sqrAnnuation(spring, v, squareAttenuation);

  for (let i = 0; i < u.length; i += 1) {
    v[i] += spring[i] * dt;
    u[i] += v[i] * dt;
  }
}

export function rungeKuttaStep(
  state: SimulationState,
  coeffs: KoeffStr[],
  dt: number,
  attenuation: number,
  squareAttenuation = 0,
  workspace?: RungeKuttaWorkspace,
): void {
  const n = state.u.length;
  const ws = workspace ?? createRungeKuttaWorkspace(n);
  const { k1u, k1v, u2, v2, u3, v3, u4, v4, k2v, k3v, k4v } = ws;
  buildAcceleration(state.u, state.v, coeffs, attenuation, squareAttenuation, k1v);

  for (let i = 0; i < n; i += 1) {
    k1u[i] = state.v[i];
  }

  for (let i = 0; i < n; i += 1) {
    u2[i] = state.u[i] + (k1u[i] * dt) / 2;
    v2[i] = state.v[i] + (k1v[i] * dt) / 2;
  }
  const k2u = v2;
  buildAcceleration(u2, v2, coeffs, attenuation, squareAttenuation, k2v);

  for (let i = 0; i < n; i += 1) {
    u3[i] = state.u[i] + (k2u[i] * dt) / 2;
    v3[i] = state.v[i] + (k2v[i] * dt) / 2;
  }
  const k3u = v3;
  buildAcceleration(u3, v3, coeffs, attenuation, squareAttenuation, k3v);

  for (let i = 0; i < n; i += 1) {
    u4[i] = state.u[i] + k3u[i] * dt;
    v4[i] = state.v[i] + k3v[i] * dt;
  }
  const k4u = v4;
  buildAcceleration(u4, v4, coeffs, attenuation, squareAttenuation, k4v);

  for (let i = 0; i < n; i += 1) {
    state.u[i] += (dt / 6) * (k1u[i] + 2 * k2u[i] + 2 * k3u[i] + k4u[i]);
    state.v[i] += (dt / 6) * (k1v[i] + 2 * k2v[i] + 2 * k3v[i] + k4v[i]);
  }
}

function buildAcceleration(
  u: Float64Array,
  v: Float64Array,
  coeffs: KoeffStr[],
  attenuation: number,
  squareAttenuation: number,
  out?: Float64Array,
): Float64Array {
  const acceleration = multiplySparse(u.length, u, coeffs, out);
  for (let i = 0; i < u.length; i += 1) {
    acceleration[i] -= attenuation * v[i];
  }
  sqrAnnuation(acceleration, v, squareAttenuation);
  return acceleration;
}

function createRungeKuttaWorkspace(n: number): RungeKuttaWorkspace {
  return {
    k1u: new Float64Array(n),
    k1v: new Float64Array(n),
    u2: new Float64Array(n),
    v2: new Float64Array(n),
    u3: new Float64Array(n),
    v3: new Float64Array(n),
    u4: new Float64Array(n),
    v4: new Float64Array(n),
    k2v: new Float64Array(n),
    k3v: new Float64Array(n),
    k4v: new Float64Array(n),
  };
}

function applyStartFadeIn(buffer: Float32Array, sampleRate: number, fadeInMs = DEFAULT_EDGE_FADE_MS): void {
  if (buffer.length === 0 || sampleRate <= 0 || fadeInMs <= 0) {
    return;
  }

  const requestedSamples = Math.round((sampleRate * fadeInMs) / 1000);
  const fadeSamples = Math.min(buffer.length, Math.max(2, requestedSamples));
  if (fadeSamples <= 1) {
    buffer[0] = 0;
    return;
  }
  for (let i = 0; i < fadeSamples; i += 1) {
    buffer[i] *= i / (fadeSamples - 1);
  }
}

function applyEndFadeOut(buffer: Float32Array, sampleRate: number, fadeOutMs = DEFAULT_EDGE_FADE_MS): void {
  if (buffer.length === 0 || sampleRate <= 0 || fadeOutMs <= 0) {
    return;
  }

  const requestedSamples = Math.round((sampleRate * fadeOutMs) / 1000);
  const fadeSamples = Math.min(buffer.length, Math.max(2, requestedSamples));
  if (fadeSamples <= 1) {
    buffer[buffer.length - 1] = 0;
    return;
  }
  const start = buffer.length - fadeSamples;
  for (let i = 0; i < fadeSamples; i += 1) {
    buffer[start + i] *= (fadeSamples - 1 - i) / (fadeSamples - 1);
  }
}

export function runSimulation(
  graph: GraphData,
  params: SimulationParams,
  onProgress?: (completed: number, total: number) => void,
  options?: RunSimulationOptions,
): SimulationResult {
  const backend = options?.backend ?? "optimized";
  if (backend === "optimized") {
    return runSimulationOptimized(graph, params, onProgress, options);
  }
  return runSimulationLegacy(graph, params, onProgress, options);
}

export function createRuntimeSimulationStepper(
  graph: GraphData,
  params: SimulationParams,
  backend: SimulationBackend = "optimized",
): RuntimeSimulationStepper {
  if (backend === "optimized") {
    return createOptimizedRuntimeStepper(graph, params) as OptimizedRuntimeSimulationStepper;
  }
  return createLegacyRuntimeStepper(graph, params);
}

function createLegacyRuntimeStepper(graph: GraphData, params: SimulationParams): RuntimeSimulationStepper {
  const totalDots = graph.dots.length;
  const dt = 1 / params.sampleRate;
  const coeffs = createConnectionStructure(graph);
  const state: SimulationState = {
    u: new Float64Array(totalDots),
    v: new Float64Array(totalDots),
  };

  for (let i = 0; i < totalDots; i += 1) {
    const dot = graph.dots[i];
    state.u[i] = dot.fixed ? 0 : dot.u;
    state.v[i] = dot.fixed ? 0 : dot.v;
  }

  const fixedIndices: number[] = [];
  for (let i = 0; i < totalDots; i += 1) {
    if (graph.dots[i].fixed) {
      fixedIndices.push(i);
    }
  }

  const eulerSpring = new Float64Array(totalDots);
  const rungeKuttaWorkspace = createRungeKuttaWorkspace(totalDots);

  return {
    state,
    step(steps = 1) {
      for (let sample = 0; sample < steps; sample += 1) {
        if (params.method === "runge-kutta") {
          rungeKuttaStep(state, coeffs, dt, params.attenuation, params.squareAttenuation, rungeKuttaWorkspace);
        } else {
          eulerCramerStep(state, coeffs, dt, params.attenuation, params.squareAttenuation, eulerSpring);
        }

        for (const index of fixedIndices) {
          state.u[index] = 0;
          state.v[index] = 0;
        }
      }
    }
  };
}

function runSimulationLegacy(
  graph: GraphData,
  params: SimulationParams,
  onProgress?: (completed: number, total: number) => void,
  options?: RunSimulationOptions,
): SimulationResult {
  const totalDots = graph.dots.length;
  const totalSamples = params.lengthK * 1024;
  const captureMode = options?.capture ?? "full";
  const captureFull = captureMode === "full";
  const runtime = createLegacyRuntimeStepper(graph, params);
  const playingPoint = Math.max(0, Math.min(totalDots - 1, graph.playingPoint ?? params.playingPoint));
  const frames: Float64Array[] = captureFull ? new Array(totalSamples) : [];
  const allPointBuffers: Float32Array[] = captureFull
    ? Array.from({ length: totalDots }, () => new Float32Array(totalSamples))
    : [];
  const playingPointBuffer = new Float32Array(totalSamples);

  for (let sample = 0; sample < totalSamples; sample += 1) {
    runtime.step(1);
    const u = runtime.state.u;

    if (captureFull) {
      for (let i = 0; i < totalDots; i += 1) {
        allPointBuffers[i][sample] = u[i];
      }
      const frame = new Float64Array(totalDots);
      frame.set(u);
      frames[sample] = frame;
    }
    playingPointBuffer[sample] = u[playingPoint] ?? 0;

    if (onProgress && (sample % 128 === 0 || sample === totalSamples - 1)) {
      onProgress(sample + 1, totalSamples);
    }
  }

  applyStartFadeIn(playingPointBuffer, params.sampleRate);
  applyEndFadeOut(playingPointBuffer, params.sampleRate);

  return { frames, playingPointBuffer, allPointBuffers };
}
