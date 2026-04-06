import type {
  FloatArray,
  GraphData,
  SimulationCaptureMode,
  SimulationParams,
  SimulationResult,
  SimulationState,
} from "./types";

const DEFAULT_EDGE_FADE_MS = 2;

type CSRGraph = {
  freeCount: number;
  rowPtr: Uint32Array;
  col: Uint32Array;
  coeff: Float64Array;
  diag: Float64Array;
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

export type CompiledSimulationGraph = {
  totalDots: number;
  freeCount: number;
  freeToGlobal: Uint32Array;
  globalToFree: Int32Array;
  initialU: Float64Array;
  initialV: Float64Array;
  csr: CSRGraph;
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
  const csr = createCSRGraph(graph, mapping.globalToFree, mapping.freeToGlobal.length);
  const playingPointGlobal = Math.max(0, Math.min(totalDots - 1, graph.playingPoint ?? params.playingPoint));
  const playingPointFree = mapping.globalToFree[playingPointGlobal];

  return {
    totalDots,
    freeCount: mapping.freeToGlobal.length,
    freeToGlobal: mapping.freeToGlobal,
    globalToFree: mapping.globalToFree,
    initialU: mapping.initialU,
    initialV: mapping.initialV,
    csr,
    playingPointGlobal,
    playingPointFree,
  };
}

export function runSimulationSortedEdgeCSR(
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
  const springScratch = new Float64Array(compiled.freeCount);
  const rk = createRungeKuttaWorkspace(compiled.freeCount);
  const dt = 1 / params.sampleRate;

  const frames = captureFull ? new Array<Float64Array>(totalSamples) : [];
  const playingPointBuffer = new Float32Array(totalSamples);
  const packedHistory = captureFull ? new Float64Array(totalSamples * compiled.totalDots) : null;

  for (let sample = 0; sample < totalSamples; sample += 1) {
    if (params.method === "runge-kutta") {
      rungeKuttaStep(state, compiled.csr, dt, params.attenuation, params.squareAttenuation, rk);
    } else {
      eulerCramerStep(state, compiled.csr, dt, params.attenuation, params.squareAttenuation, springScratch);
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

export function runSimulationSortedEdgeCSRBackend(
  graph: GraphData,
  params: SimulationParams,
  onProgress?: (completed: number, total: number) => void,
  options?: RunSimulationOptions,
): SimulationResult {
  const compiled = compileGraph(graph, params);
  return runSimulationSortedEdgeCSR(compiled, params, onProgress, options);
}

export function createSortedEdgeCSRRuntimeStepper(
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

  const springScratch = new Float64Array(compiled.freeCount);
  const rk = createRungeKuttaWorkspace(compiled.freeCount);

  return {
    state,
    step(steps = 1) {
      for (let s = 0; s < steps; s += 1) {
        if (params.method === "runge-kutta") {
          rungeKuttaStep(
            dynamicState,
            compiled.csr,
            dt,
            params.attenuation,
            params.squareAttenuation,
            rk,
          );
        } else {
          eulerCramerStep(
            dynamicState,
            compiled.csr,
            dt,
            params.attenuation,
            params.squareAttenuation,
            springScratch,
          );
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

export function createSortedEdgeCSRRuntimeStepperBackend(
  graph: GraphData,
  params: SimulationParams,
): RuntimeSimulationStepper {
  const compiled = compileGraph(graph, params);
  return createSortedEdgeCSRRuntimeStepper(compiled, params);
}

// ---------------------------------------------------------------------------
// Graph compilation helpers
// ---------------------------------------------------------------------------

function createCSRGraph(graph: GraphData, globalToFree: Int32Array, freeCount: number): CSRGraph {
  const rowCol: number[][] = Array.from({ length: freeCount }, () => []);
  const rowCoeff: number[][] = Array.from({ length: freeCount }, () => []);
  const diag = new Float64Array(freeCount);

  for (const line of graph.lines) {
    const d1 = graph.dots[line.dot1];
    const d2 = graph.dots[line.dot2];
    if (!d1 || !d2) {
      continue;
    }

    if (!d1.fixed && !d2.fixed) {
      const i = globalToFree[line.dot1];
      const j = globalToFree[line.dot2];
      const coeffI = line.k / d1.weight;
      const coeffJ = line.k / d2.weight;

      diag[i] -= coeffI;
      diag[j] -= coeffJ;

      rowCol[i].push(j);
      rowCoeff[i].push(coeffI);
      rowCol[j].push(i);
      rowCoeff[j].push(coeffJ);
      continue;
    }

    if (!d1.fixed) {
      const i = globalToFree[line.dot1];
      diag[i] -= line.k / d1.weight;
    }
    if (!d2.fixed) {
      const i = globalToFree[line.dot2];
      diag[i] -= line.k / d2.weight;
    }
  }

  const rowPtr = new Uint32Array(freeCount + 1);
  let totalNnz = 0;
  for (let i = 0; i < freeCount; i += 1) {
    totalNnz += rowCol[i].length;
    rowPtr[i + 1] = totalNnz;
  }

  const col = new Uint32Array(totalNnz);
  const coeff = new Float64Array(totalNnz);

  let cursor = 0;
  for (let i = 0; i < freeCount; i += 1) {
    const cols = rowCol[i];
    const coeffs = rowCoeff[i];
    const order = cols.map((_, idx) => idx).sort((a, b) => cols[a] - cols[b]);
    for (const idx of order) {
      col[cursor] = cols[idx];
      coeff[cursor] = coeffs[idx];
      cursor += 1;
    }
  }

  return {
    freeCount,
    rowPtr,
    col,
    coeff,
    diag,
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
      const freeIdx = freeToGlobal.length;
      freeToGlobal.push(globalIndex);
      globalToFree[globalIndex] = freeIdx;
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

// ---------------------------------------------------------------------------
// Physics: spring acceleration (CSR gather pass)
// ---------------------------------------------------------------------------

function computeSpringAccelerationCSR(u: FloatArray, csr: CSRGraph, out: FloatArray): void {
  const { freeCount, rowPtr, col, coeff, diag } = csr;
  for (let i = 0; i < freeCount; i += 1) {
    let acc = diag[i] * u[i];
    const end = rowPtr[i + 1];
    for (let k = rowPtr[i]; k < end; k += 1) {
      acc += coeff[k] * u[col[k]];
    }
    out[i] = acc;
  }
}

// ---------------------------------------------------------------------------
// Physics: fused acceleration = spring + linear damping + square damping
// ---------------------------------------------------------------------------

function buildAcceleration(
  u: FloatArray,
  v: FloatArray,
  csr: CSRGraph,
  attenuation: number,
  squareAttenuation: number,
  out: FloatArray,
): void {
  computeSpringAccelerationCSR(u, csr, out);
  for (let i = 0; i < u.length; i += 1) {
    out[i] = out[i] - attenuation * v[i] - squareAttenuation * Math.abs(v[i]) * v[i];
  }
}

// ---------------------------------------------------------------------------
// Integrators
// ---------------------------------------------------------------------------

function eulerCramerStep(
  state: SimulationState,
  csr: CSRGraph,
  dt: number,
  attenuation: number,
  squareAttenuation: number,
  springScratch: FloatArray,
): void {
  const { u, v } = state;
  computeSpringAccelerationCSR(u, csr, springScratch);

  for (let i = 0; i < u.length; i += 1) {
    const acc = springScratch[i] - attenuation * v[i] - squareAttenuation * Math.abs(v[i]) * v[i];
    v[i] += acc * dt;
    u[i] += v[i] * dt;
  }
}

function rungeKuttaStep(
  state: SimulationState,
  csr: CSRGraph,
  dt: number,
  attenuation: number,
  squareAttenuation: number,
  workspace: RungeKuttaWorkspace,
): void {
  const n = state.u.length;
  const { k1u, k1v, u2, v2, u3, v3, u4, v4, k2v, k3v, k4v } = workspace;
  buildAcceleration(state.u, state.v, csr, attenuation, squareAttenuation, k1v);

  for (let i = 0; i < n; i += 1) {
    k1u[i] = state.v[i];
  }

  for (let i = 0; i < n; i += 1) {
    u2[i] = state.u[i] + (k1u[i] * dt) / 2;
    v2[i] = state.v[i] + (k1v[i] * dt) / 2;
  }
  const k2u = v2;
  buildAcceleration(u2, v2, csr, attenuation, squareAttenuation, k2v);

  for (let i = 0; i < n; i += 1) {
    u3[i] = state.u[i] + (k2u[i] * dt) / 2;
    v3[i] = state.v[i] + (k2v[i] * dt) / 2;
  }
  const k3u = v3;
  buildAcceleration(u3, v3, csr, attenuation, squareAttenuation, k3v);

  for (let i = 0; i < n; i += 1) {
    u4[i] = state.u[i] + k3u[i] * dt;
    v4[i] = state.v[i] + k3v[i] * dt;
  }
  const k4u = v4;
  buildAcceleration(u4, v4, csr, attenuation, squareAttenuation, k4v);

  for (let i = 0; i < n; i += 1) {
    state.u[i] += (dt / 6) * (k1u[i] + 2 * k2u[i] + 2 * k3u[i] + k4u[i]);
    state.v[i] += (dt / 6) * (k1v[i] + 2 * k2v[i] + 2 * k3v[i] + k4v[i]);
  }
}

// ---------------------------------------------------------------------------
// Workspace allocation
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Edge fades
// ---------------------------------------------------------------------------

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
