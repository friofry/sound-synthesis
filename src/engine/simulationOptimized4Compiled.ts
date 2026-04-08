import type {
  FloatArray,
  GraphData,
  SimulationCaptureMode,
  SimulationParams,
  SimulationResult,
  SimulationState,
} from "./types";

const DEFAULT_EDGE_FADE_MS = 2;

type FreeFreeEdges = {
  edgeI: Uint32Array;
  edgeJ: Uint32Array;
  kOverMassI: Float64Array;
  kOverMassJ: Float64Array;
};

type FreeFixedEdges = {
  freeIndex: Uint32Array;
  kOverMass: Float64Array;
};

type SplitEdges = {
  freeFree: FreeFreeEdges;
  freeFixed: FreeFixedEdges;
};

type FreeNodeMapping = {
  freeToGlobal: Uint32Array;
  globalToFree: Int32Array;
  initialU: Float64Array;
  initialV: Float64Array;
};

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

export type RuntimeSimulationStepper = {
  state: SimulationState;
  step: (steps?: number) => void;
};

function normalizeSubsteps(value: number | undefined): number {
  if (!Number.isFinite(value)) return 1;
  const rounded = Math.round(value ?? 1);
  if (rounded <= 1) return 1;
  if (rounded <= 2) return 2;
  if (rounded <= 4) return 4;
  return 8;
}

function estimateAdaptiveSubstepsFromEdges(edges: SplitEdges, sampleRate: number): number {
  if (sampleRate <= 0) {
    return 1;
  }
  let maxCoeff = 0;
  for (let i = 0; i < edges.freeFree.kOverMassI.length; i += 1) {
    maxCoeff = Math.max(maxCoeff, Math.abs(edges.freeFree.kOverMassI[i]), Math.abs(edges.freeFree.kOverMassJ[i]));
  }
  for (let i = 0; i < edges.freeFixed.kOverMass.length; i += 1) {
    maxCoeff = Math.max(maxCoeff, Math.abs(edges.freeFixed.kOverMass[i]));
  }
  const stiffnessRatio = Math.sqrt(maxCoeff) / sampleRate;
  if (stiffnessRatio > 0.12) return 8;
  if (stiffnessRatio > 0.06) return 4;
  if (stiffnessRatio > 0.03) return 2;
  return 1;
}

export type CompiledSimulationGraph = {
  totalDots: number;
  freeCount: number;
  freeToGlobal: Uint32Array;
  globalToFree: Int32Array;
  initialU: Float64Array;
  initialV: Float64Array;
  edges: SplitEdges;
  playingPointGlobal: number;
  playingPointFree: number;
};

type RunSimulationOptions = {
  capture?: SimulationCaptureMode;
};

export function compileGraph(
  graph: GraphData,
  params: Pick<SimulationParams, "playingPoint">,
): CompiledSimulationGraph {
  const totalDots = graph.dots.length;
  const mapping = createFreeNodeMapping(graph);
  const edges = createSplitEdges(graph, mapping.globalToFree);
  const playingPointGlobal = Math.max(0, Math.min(totalDots - 1, graph.playingPoint ?? params.playingPoint));
  const playingPointFree = mapping.globalToFree[playingPointGlobal];

  return {
    totalDots,
    freeCount: mapping.freeToGlobal.length,
    freeToGlobal: mapping.freeToGlobal,
    globalToFree: mapping.globalToFree,
    initialU: mapping.initialU,
    initialV: mapping.initialV,
    edges,
    playingPointGlobal,
    playingPointFree,
  };
}

export function runSimulationCompiled(
  compiled: CompiledSimulationGraph,
  params: SimulationParams,
  onProgress?: (completed: number, total: number) => void,
  options?: RunSimulationOptions,
): SimulationResult {
  const totalSamples = params.lengthK * 1024;
  const captureMode = options?.capture ?? "full";
  const captureFull = captureMode === "full";

  const state: SimulationState = {
    u: compiled.initialU.slice(),
    v: compiled.initialV.slice(),
  };
  const eulerSpring = new Float64Array(compiled.freeCount);
  const rk = createRungeKuttaWorkspace(compiled.freeCount);
  const dt = 1 / params.sampleRate;
  const fixedSubsteps = normalizeSubsteps(params.substeps);
  const adaptiveSubsteps = estimateAdaptiveSubstepsFromEdges(compiled.edges, params.sampleRate);
  const resolveSubsteps = () => (params.substepsMode === "adaptive" ? adaptiveSubsteps : fixedSubsteps);
  const integrateOne =
    params.method === "runge-kutta"
      ? (stepDt: number) =>
        rungeKuttaStepCompiled(state, compiled.edges, stepDt, params.attenuation, params.squareAttenuation, rk)
      : (stepDt: number) =>
        eulerCramerStepCompiled(state, compiled.edges, stepDt, params.attenuation, params.squareAttenuation, eulerSpring);

  const frames = captureFull ? new Array<Float64Array>(totalSamples) : [];
  const playingPointBuffer = new Float32Array(totalSamples);
  const packedHistory = captureFull ? new Float64Array(totalSamples * compiled.totalDots) : null;

  for (let sample = 0; sample < totalSamples; sample += 1) {
    const sampleSubsteps = resolveSubsteps();
    const sampleDt = dt / sampleSubsteps;
    for (let sub = 0; sub < sampleSubsteps; sub += 1) {
      integrateOne(sampleDt);
    }

    if (packedHistory) {
      const offset = sample * compiled.totalDots;
      for (let i = 0; i < compiled.freeToGlobal.length; i += 1) {
        packedHistory[offset + compiled.freeToGlobal[i]] = state.u[i];
      }
    }

    playingPointBuffer[sample] = compiled.playingPointFree >= 0 ? state.u[compiled.playingPointFree] ?? 0 : 0;

    if (onProgress && (sample % 128 === 0 || sample === totalSamples - 1)) {
      onProgress(sample + 1, totalSamples);
    }
  }

  let allPointBuffers: Float32Array[] = [];
  if (packedHistory) {
    for (let sample = 0; sample < totalSamples; sample += 1) {
      const offset = sample * compiled.totalDots;
      frames[sample] = packedHistory.subarray(offset, offset + compiled.totalDots);
    }

    allPointBuffers = Array.from({ length: compiled.totalDots }, () => new Float32Array(totalSamples));
    for (let sample = 0; sample < totalSamples; sample += 1) {
      const offset = sample * compiled.totalDots;
      for (let dot = 0; dot < compiled.totalDots; dot += 1) {
        allPointBuffers[dot][sample] = packedHistory[offset + dot];
      }
    }
  }

  applyStartFadeIn(playingPointBuffer, params.sampleRate);
  applyEndFadeOut(playingPointBuffer, params.sampleRate);

  return {
    frames,
    allPointBuffers,
    playingPointBuffer,
  };
}

export function runSimulationCompiledBackend(
  graph: GraphData,
  params: SimulationParams,
  onProgress?: (completed: number, total: number) => void,
  options?: RunSimulationOptions,
): SimulationResult {
  const compiled = compileGraph(graph, params);
  return runSimulationCompiled(compiled, params, onProgress, options);
}

export function createCompiledRuntimeStepper(
  compiled: CompiledSimulationGraph,
  params: SimulationParams,
): RuntimeSimulationStepper {
  const dt = 1 / params.sampleRate;
  const state: SimulationState = {
    u: new Float64Array(compiled.totalDots),
    v: new Float64Array(compiled.totalDots),
  };
  const dynamicState: SimulationState = {
    u: compiled.initialU.slice(),
    v: compiled.initialV.slice(),
  };

  for (let i = 0; i < compiled.freeToGlobal.length; i += 1) {
    const globalIndex = compiled.freeToGlobal[i];
    state.u[globalIndex] = dynamicState.u[i];
    state.v[globalIndex] = dynamicState.v[i];
  }

  const eulerSpring = new Float64Array(compiled.freeCount);
  const rk = createRungeKuttaWorkspace(compiled.freeCount);
  const fixedSubsteps = normalizeSubsteps(params.substeps);
  const adaptiveSubsteps = estimateAdaptiveSubstepsFromEdges(compiled.edges, params.sampleRate);
  const resolveSubsteps = () => (params.substepsMode === "adaptive" ? adaptiveSubsteps : fixedSubsteps);
  const integrateOne =
    params.method === "runge-kutta"
      ? (stepDt: number) =>
        rungeKuttaStepCompiled(
          dynamicState,
          compiled.edges,
          stepDt,
          params.attenuation,
          params.squareAttenuation,
          rk,
        )
      : (stepDt: number) =>
        eulerCramerStepCompiled(
          dynamicState,
          compiled.edges,
          stepDt,
          params.attenuation,
          params.squareAttenuation,
          eulerSpring,
        );

  return {
    state,
    step(steps = 1) {
      for (let s = 0; s < steps; s += 1) {
        const sampleSubsteps = resolveSubsteps();
        const sampleDt = dt / sampleSubsteps;
        for (let sub = 0; sub < sampleSubsteps; sub += 1) {
          integrateOne(sampleDt);
        }
      }

      for (let i = 0; i < compiled.freeToGlobal.length; i += 1) {
        const globalIndex = compiled.freeToGlobal[i];
        state.u[globalIndex] = dynamicState.u[i];
        state.v[globalIndex] = dynamicState.v[i];
      }
    },
  };
}

export function createCompiledRuntimeStepperBackend(
  graph: GraphData,
  params: SimulationParams,
): RuntimeSimulationStepper {
  const compiled = compileGraph(graph, params);
  return createCompiledRuntimeStepper(compiled, params);
}

function createSplitEdges(graph: GraphData, globalToFree: Int32Array): SplitEdges {
  const edgeI: number[] = [];
  const edgeJ: number[] = [];
  const kOverMassI: number[] = [];
  const kOverMassJ: number[] = [];
  const freeIndex: number[] = [];
  const kOverMass: number[] = [];

  for (const line of graph.lines) {
    const d1 = graph.dots[line.dot1];
    const d2 = graph.dots[line.dot2];
    if (!d1 || !d2) {
      continue;
    }

    if (!d1.fixed && !d2.fixed) {
      edgeI.push(globalToFree[line.dot1]);
      edgeJ.push(globalToFree[line.dot2]);
      kOverMassI.push(line.k / d1.weight);
      kOverMassJ.push(line.k / d2.weight);
      continue;
    }

    if (!d1.fixed) {
      freeIndex.push(globalToFree[line.dot1]);
      kOverMass.push(-line.k / d1.weight);
    }
    if (!d2.fixed) {
      freeIndex.push(globalToFree[line.dot2]);
      kOverMass.push(-line.k / d2.weight);
    }
  }

  return {
    freeFree: {
      edgeI: Uint32Array.from(edgeI),
      edgeJ: Uint32Array.from(edgeJ),
      kOverMassI: Float64Array.from(kOverMassI),
      kOverMassJ: Float64Array.from(kOverMassJ),
    },
    freeFixed: {
      freeIndex: Uint32Array.from(freeIndex),
      kOverMass: Float64Array.from(kOverMass),
    },
  };
}

function createFreeNodeMapping(graph: GraphData): FreeNodeMapping {
  const globalToFree = new Int32Array(graph.dots.length);
  globalToFree.fill(-1);
  const freeToGlobal: number[] = [];
  const initialU: number[] = [];
  const initialV: number[] = [];

  for (let globalIndex = 0; globalIndex < graph.dots.length; globalIndex += 1) {
    const dot = graph.dots[globalIndex];
    if (!dot.fixed) {
      const freeIndex = freeToGlobal.length;
      freeToGlobal.push(globalIndex);
      globalToFree[globalIndex] = freeIndex;
      initialU.push(dot.u);
      initialV.push(dot.v);
    }
  }

  return {
    freeToGlobal: Uint32Array.from(freeToGlobal),
    globalToFree,
    initialU: Float64Array.from(initialU),
    initialV: Float64Array.from(initialV),
  };
}

function computeSpringAcceleration(u: FloatArray, edges: SplitEdges, out: FloatArray): FloatArray {
  out.fill(0);
  const { freeFree, freeFixed } = edges;

  for (let e = 0; e < freeFree.edgeI.length; e += 1) {
    const i = freeFree.edgeI[e];
    const j = freeFree.edgeJ[e];
    const du = u[j] - u[i];
    out[i] += freeFree.kOverMassI[e] * du;
    out[j] -= freeFree.kOverMassJ[e] * du;
  }

  for (let e = 0; e < freeFixed.freeIndex.length; e += 1) {
    const i = freeFixed.freeIndex[e];
    out[i] += freeFixed.kOverMass[e] * u[i];
  }

  return out;
}

function applySquareAttenuation(acceleration: FloatArray, velocity: FloatArray, squareAttenuation: number): void {
  for (let i = 0; i < velocity.length; i += 1) {
    acceleration[i] -= squareAttenuation * Math.abs(velocity[i]) * velocity[i];
  }
}

function eulerCramerStepCompiled(
  state: SimulationState,
  edges: SplitEdges,
  dt: number,
  attenuation: number,
  squareAttenuation: number,
  springScratch: FloatArray,
): void {
  const { u, v } = state;
  const spring = computeSpringAcceleration(u, edges, springScratch);
  for (let i = 0; i < u.length; i += 1) {
    spring[i] -= attenuation * v[i];
  }
  applySquareAttenuation(spring, v, squareAttenuation);

  for (let i = 0; i < u.length; i += 1) {
    v[i] += spring[i] * dt;
    u[i] += v[i] * dt;
  }
}

function rungeKuttaStepCompiled(
  state: SimulationState,
  edges: SplitEdges,
  dt: number,
  attenuation: number,
  squareAttenuation: number,
  workspace: RungeKuttaWorkspace,
): void {
  const n = state.u.length;
  const { k1u, k1v, u2, v2, u3, v3, u4, v4, k2v, k3v, k4v } = workspace;
  buildAcceleration(state.u, state.v, edges, attenuation, squareAttenuation, k1v);

  for (let i = 0; i < n; i += 1) {
    k1u[i] = state.v[i];
  }

  for (let i = 0; i < n; i += 1) {
    u2[i] = state.u[i] + (k1u[i] * dt) / 2;
    v2[i] = state.v[i] + (k1v[i] * dt) / 2;
  }
  const k2u = v2;
  buildAcceleration(u2, v2, edges, attenuation, squareAttenuation, k2v);

  for (let i = 0; i < n; i += 1) {
    u3[i] = state.u[i] + (k2u[i] * dt) / 2;
    v3[i] = state.v[i] + (k2v[i] * dt) / 2;
  }
  const k3u = v3;
  buildAcceleration(u3, v3, edges, attenuation, squareAttenuation, k3v);

  for (let i = 0; i < n; i += 1) {
    u4[i] = state.u[i] + k3u[i] * dt;
    v4[i] = state.v[i] + k3v[i] * dt;
  }
  const k4u = v4;
  buildAcceleration(u4, v4, edges, attenuation, squareAttenuation, k4v);

  for (let i = 0; i < n; i += 1) {
    state.u[i] += (dt / 6) * (k1u[i] + 2 * k2u[i] + 2 * k3u[i] + k4u[i]);
    state.v[i] += (dt / 6) * (k1v[i] + 2 * k2v[i] + 2 * k3v[i] + k4v[i]);
  }
}

function buildAcceleration(
  u: FloatArray,
  v: FloatArray,
  edges: SplitEdges,
  attenuation: number,
  squareAttenuation: number,
  out: FloatArray,
): FloatArray {
  const acceleration = computeSpringAcceleration(u, edges, out);
  for (let i = 0; i < u.length; i += 1) {
    acceleration[i] -= attenuation * v[i];
  }
  applySquareAttenuation(acceleration, v, squareAttenuation);
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
