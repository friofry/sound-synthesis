import type {
  FloatArray,
  GraphData,
  SimulationParams,
  SimulationResult,
  SimulationState,
} from "./types";
import type {
  RunSimulationOptions as SharedRunSimulationOptions,
  RuntimeSimulationStepper as SharedRuntimeSimulationStepper,
} from "./simulationRuntimeTypes";
import { forEachSpringLine } from "./simulationAssembly";
import { applyVelocityDamping } from "./simulationDamping";
import { applyEndFadeOut, applyStartFadeIn } from "./simulationFade";
import { createIntegratorStep } from "./simulationIntegratorBridge";
import { clampFixedNodes, collectFixedIndices, initializeStateFromGraph } from "./simulationState";
import { resolveSampleSubsteps, substepsFromStiffnessRatio } from "./simulationSubsteps";

type PackedSparseMatrix = {
  row: Uint32Array;
  col: Uint32Array;
  value: Float64Array;
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

export type RuntimeSimulationStepper = SharedRuntimeSimulationStepper;

function estimateAdaptiveSubstepsFromMatrix(matrix: PackedSparseMatrix, nodeCount: number, sampleRate: number): number {
  if (nodeCount <= 0 || sampleRate <= 0 || matrix.value.length === 0) {
    return 1;
  }
  const rowAbs = new Float64Array(nodeCount);
  for (let i = 0; i < matrix.value.length; i += 1) {
    rowAbs[matrix.row[i]] += Math.abs(matrix.value[i]);
  }
  let maxRowAbs = 0;
  for (let i = 0; i < rowAbs.length; i += 1) {
    maxRowAbs = Math.max(maxRowAbs, rowAbs[i]);
  }
  return substepsFromStiffnessRatio(Math.sqrt(maxRowAbs) / sampleRate);
}

type RunSimulationOptions = Pick<SharedRunSimulationOptions, "capture">;

export function runSimulationOptimized(
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
  const runtime = createOptimizedRuntimeStepper(graph, params);

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

export function createOptimizedRuntimeStepper(graph: GraphData, params: SimulationParams): RuntimeSimulationStepper {
  const totalDots = graph.dots.length;
  const dt = 1 / params.sampleRate;
  const matrix = createPackedConnectionMatrix(graph);
  const fixedIndices = collectFixedIndices(graph);
  const state: SimulationState = initializeStateFromGraph(graph);

  const eulerSpring = new Float64Array(totalDots);
  const rk = createRungeKuttaWorkspace(totalDots);
  const adaptiveSubsteps = estimateAdaptiveSubstepsFromMatrix(matrix, totalDots, params.sampleRate);
  const resolveSubsteps = resolveSampleSubsteps(params, adaptiveSubsteps);
  const integrateOne = createIntegratorStep(
    params.method,
    (stepDt: number) =>
      eulerCramerStepOptimized(state, matrix, stepDt, params.attenuation, params.squareAttenuation, eulerSpring),
    (stepDt: number) =>
      rungeKuttaStepOptimized(state, matrix, stepDt, params.attenuation, params.squareAttenuation, rk),
  );

  return {
    state,
    step(steps = 1) {
      for (let s = 0; s < steps; s += 1) {
        const sampleSubsteps = resolveSubsteps();
        const sampleDt = dt / sampleSubsteps;
        for (let sub = 0; sub < sampleSubsteps; sub += 1) {
          integrateOne(sampleDt);
          clampFixedNodes(state, fixedIndices);
        }
      }
    },
  };
}

function createPackedConnectionMatrix(graph: GraphData): PackedSparseMatrix {
  const row: number[] = [];
  const col: number[] = [];
  const value: number[] = [];

  const add = (i: number, j: number, v: number) => {
    if (v !== 0) {
      row.push(i);
      col.push(j);
      value.push(v);
    }
  };

  forEachSpringLine(graph, (line, d1, d2) => {
    if (!d1.fixed && !d2.fixed) {
      add(line.dot1, line.dot1, -line.k / d1.weight);
      add(line.dot1, line.dot2, line.k / d1.weight);
      add(line.dot2, line.dot2, -line.k / d2.weight);
      add(line.dot2, line.dot1, line.k / d2.weight);
      return;
    }

    if (!d1.fixed) {
      add(line.dot1, line.dot1, -line.k / d1.weight);
    }
    if (!d2.fixed) {
      add(line.dot2, line.dot2, -line.k / d2.weight);
    }
  });

  return {
    row: Uint32Array.from(row),
    col: Uint32Array.from(col),
    value: Float64Array.from(value),
  };
}

function multiplyPackedSparse(
  n: number,
  vector: FloatArray,
  matrix: PackedSparseMatrix,
  out: FloatArray,
): FloatArray {
  const result = out.length === n ? out : new Float64Array(n);
  result.fill(0);
  for (let i = 0; i < matrix.value.length; i += 1) {
    result[matrix.row[i]] += matrix.value[i] * vector[matrix.col[i]];
  }
  return result;
}

function eulerCramerStepOptimized(
  state: SimulationState,
  matrix: PackedSparseMatrix,
  dt: number,
  attenuation: number,
  squareAttenuation: number,
  springScratch: FloatArray,
): void {
  const { u, v } = state;
  const spring = multiplyPackedSparse(u.length, u, matrix, springScratch);
  applyVelocityDamping(spring, v, attenuation, squareAttenuation);

  for (let i = 0; i < u.length; i += 1) {
    v[i] += spring[i] * dt;
    u[i] += v[i] * dt;
  }
}

function rungeKuttaStepOptimized(
  state: SimulationState,
  matrix: PackedSparseMatrix,
  dt: number,
  attenuation: number,
  squareAttenuation: number,
  workspace: RungeKuttaWorkspace,
): void {
  const n = state.u.length;
  const { k1u, k1v, u2, v2, u3, v3, u4, v4, k2v, k3v, k4v } = workspace;
  buildAcceleration(state.u, state.v, matrix, attenuation, squareAttenuation, k1v);

  for (let i = 0; i < n; i += 1) {
    k1u[i] = state.v[i];
  }

  for (let i = 0; i < n; i += 1) {
    u2[i] = state.u[i] + (k1u[i] * dt) / 2;
    v2[i] = state.v[i] + (k1v[i] * dt) / 2;
  }
  const k2u = v2;
  buildAcceleration(u2, v2, matrix, attenuation, squareAttenuation, k2v);

  for (let i = 0; i < n; i += 1) {
    u3[i] = state.u[i] + (k2u[i] * dt) / 2;
    v3[i] = state.v[i] + (k2v[i] * dt) / 2;
  }
  const k3u = v3;
  buildAcceleration(u3, v3, matrix, attenuation, squareAttenuation, k3v);

  for (let i = 0; i < n; i += 1) {
    u4[i] = state.u[i] + k3u[i] * dt;
    v4[i] = state.v[i] + k3v[i] * dt;
  }
  const k4u = v4;
  buildAcceleration(u4, v4, matrix, attenuation, squareAttenuation, k4v);

  for (let i = 0; i < n; i += 1) {
    state.u[i] += (dt / 6) * (k1u[i] + 2 * k2u[i] + 2 * k3u[i] + k4u[i]);
    state.v[i] += (dt / 6) * (k1v[i] + 2 * k2v[i] + 2 * k3v[i] + k4v[i]);
  }
}

function buildAcceleration(
  u: FloatArray,
  v: FloatArray,
  matrix: PackedSparseMatrix,
  attenuation: number,
  squareAttenuation: number,
  out: FloatArray,
): FloatArray {
  const acceleration = multiplyPackedSparse(u.length, u, matrix, out);
  applyVelocityDamping(acceleration, v, attenuation, squareAttenuation);
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

