import type {
  FloatArray,
  GraphData,
  SimulationCaptureMode,
  SimulationParams,
  SimulationResult,
  SimulationState,
} from "./types";

const DEFAULT_EDGE_FADE_MS = 2;

type EdgeList = {
  edgeI: Uint32Array;
  edgeJ: Uint32Array;
  kOverMassI: Float64Array;
  kOverMassJ: Float64Array;
  diagIndex: Uint32Array;
  diagValue: Float64Array;
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

type RunSimulationOptions = {
  capture?: SimulationCaptureMode;
};

export function runSimulationEdgeList(
  graph: GraphData,
  params: SimulationParams,
  onProgress?: (completed: number, total: number) => void,
  options?: RunSimulationOptions,
): SimulationResult {
  const totalDots = graph.dots.length;
  const totalSamples = params.lengthK * 1024;
  const captureMode = options?.capture ?? "full";
  const captureFull = captureMode === "full";
  const playingPoint = Math.max(0, Math.min(totalDots - 1, graph.playingPoint ?? params.playingPoint));
  const runtime = createEdgeListRuntimeStepper(graph, params);

  const frames = captureFull ? new Array<Float64Array>(totalSamples) : [];
  const playingPointBuffer = new Float32Array(totalSamples);
  const packedHistory = captureFull ? new Float64Array(totalSamples * totalDots) : null;

  for (let sample = 0; sample < totalSamples; sample += 1) {
    runtime.step(1);
    const u = runtime.state.u;

    if (packedHistory) {
      packedHistory.set(u, sample * totalDots);
    }
    playingPointBuffer[sample] = u[playingPoint] ?? 0;

    if (onProgress && (sample % 128 === 0 || sample === totalSamples - 1)) {
      onProgress(sample + 1, totalSamples);
    }
  }

  let allPointBuffers: Float32Array[] = [];
  if (packedHistory) {
    for (let sample = 0; sample < totalSamples; sample += 1) {
      const offset = sample * totalDots;
      frames[sample] = packedHistory.subarray(offset, offset + totalDots);
    }

    allPointBuffers = Array.from({ length: totalDots }, () => new Float32Array(totalSamples));
    for (let sample = 0; sample < totalSamples; sample += 1) {
      const offset = sample * totalDots;
      for (let dot = 0; dot < totalDots; dot += 1) {
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

export function createEdgeListRuntimeStepper(graph: GraphData, params: SimulationParams): RuntimeSimulationStepper {
  const totalDots = graph.dots.length;
  const dt = 1 / params.sampleRate;
  const edges = createEdgeList(graph);
  const fixedIndices = collectFixedIndices(graph);
  const state: SimulationState = {
    u: new Float64Array(totalDots),
    v: new Float64Array(totalDots),
  };

  for (let i = 0; i < totalDots; i += 1) {
    const dot = graph.dots[i];
    state.u[i] = dot.fixed ? 0 : dot.u;
    state.v[i] = dot.fixed ? 0 : dot.v;
  }

  const eulerSpring = new Float64Array(totalDots);
  const rk = createRungeKuttaWorkspace(totalDots);

  return {
    state,
    step(steps = 1) {
      for (let s = 0; s < steps; s += 1) {
        if (params.method === "runge-kutta") {
          rungeKuttaStepEdgeList(state, edges, dt, params.attenuation, params.squareAttenuation, rk);
        } else {
          eulerCramerStepEdgeList(state, edges, dt, params.attenuation, params.squareAttenuation, eulerSpring);
        }

        for (const index of fixedIndices) {
          state.u[index] = 0;
          state.v[index] = 0;
        }
      }
    },
  };
}

function createEdgeList(graph: GraphData): EdgeList {
  const edgeI: number[] = [];
  const edgeJ: number[] = [];
  const kOverMassI: number[] = [];
  const kOverMassJ: number[] = [];
  const diagIndex: number[] = [];
  const diagValue: number[] = [];

  for (const line of graph.lines) {
    const d1 = graph.dots[line.dot1];
    const d2 = graph.dots[line.dot2];
    if (!d1 || !d2) {
      continue;
    }

    if (!d1.fixed && !d2.fixed) {
      edgeI.push(line.dot1);
      edgeJ.push(line.dot2);
      kOverMassI.push(line.k / d1.weight);
      kOverMassJ.push(line.k / d2.weight);
      continue;
    }

    if (!d1.fixed) {
      diagIndex.push(line.dot1);
      diagValue.push(-line.k / d1.weight);
    }
    if (!d2.fixed) {
      diagIndex.push(line.dot2);
      diagValue.push(-line.k / d2.weight);
    }
  }

  return {
    edgeI: Uint32Array.from(edgeI),
    edgeJ: Uint32Array.from(edgeJ),
    kOverMassI: Float64Array.from(kOverMassI),
    kOverMassJ: Float64Array.from(kOverMassJ),
    diagIndex: Uint32Array.from(diagIndex),
    diagValue: Float64Array.from(diagValue),
  };
}

function collectFixedIndices(graph: GraphData): number[] {
  const fixed: number[] = [];
  for (let i = 0; i < graph.dots.length; i += 1) {
    if (graph.dots[i].fixed) {
      fixed.push(i);
    }
  }
  return fixed;
}

function computeSpringAcceleration(u: FloatArray, edges: EdgeList, out: FloatArray): FloatArray {
  out.fill(0);

  for (let e = 0; e < edges.edgeI.length; e += 1) {
    const i = edges.edgeI[e];
    const j = edges.edgeJ[e];
    const du = u[j] - u[i];
    out[i] += edges.kOverMassI[e] * du;
    out[j] -= edges.kOverMassJ[e] * du;
  }

  for (let d = 0; d < edges.diagIndex.length; d += 1) {
    const i = edges.diagIndex[d];
    out[i] += edges.diagValue[d] * u[i];
  }

  return out;
}

function applySquareAttenuation(acceleration: FloatArray, velocity: FloatArray, squareAttenuation: number): void {
  for (let i = 0; i < velocity.length; i += 1) {
    acceleration[i] -= squareAttenuation * Math.abs(velocity[i]) * velocity[i];
  }
}

function eulerCramerStepEdgeList(
  state: SimulationState,
  edges: EdgeList,
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

function rungeKuttaStepEdgeList(
  state: SimulationState,
  edges: EdgeList,
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
  edges: EdgeList,
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
