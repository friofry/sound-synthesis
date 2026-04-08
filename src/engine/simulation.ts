import type {
  FloatArray,
  GraphData,
  KoeffStr,
  SimulationBackend,
  SimulationCaptureMode,
  SimulationParams,
  SimulationPrecision,
  SimulationResult,
  SimulationState,
} from "./types";
import {
  createOptimizedRuntimeStepper,
  runSimulationOptimized,
  type RuntimeSimulationStepper as OptimizedRuntimeSimulationStepper,
} from "./simulationOptimized";
import {
  createEdgeListRuntimeStepper,
  runSimulationEdgeList,
  type RuntimeSimulationStepper as EdgeListRuntimeSimulationStepper,
} from "./simulationOptimized2EdgeList";
import {
  createEdgeTypesRuntimeStepper,
  runSimulationEdgeTypes,
  type RuntimeSimulationStepper as EdgeTypesRuntimeSimulationStepper,
} from "./simulationOptimized3EdgeTypes";
import {
  createCompiledRuntimeStepperBackend,
  runSimulationCompiledBackend,
  type RuntimeSimulationStepper as CompiledRuntimeSimulationStepper,
} from "./simulationOptimized4Compiled";
import {
  createFusedLoopRuntimeStepperBackend,
  runSimulationFusedLoopBackend,
  type RuntimeSimulationStepper as FusedLoopRuntimeSimulationStepper,
} from "./simulationOptimized5FusedLoop";
import {
  createSortedEdgeCSRRuntimeStepperBackend,
  runSimulationSortedEdgeCSRBackend,
  type RuntimeSimulationStepper as SortedEdgeCSRRuntimeSimulationStepper,
} from "./simulationOptimized6SortedEdgeCSR";
import {
  createWasmRuntimeStepperBackend,
  runSimulationWasmBackend,
  type RuntimeSimulationStepper as WasmRuntimeSimulationStepper,
} from "./simulationOptimized7Wasm";
import {
  createWasmSimdRuntimeStepperBackend,
  runSimulationWasmSimdBackend,
  type RuntimeSimulationStepper as WasmSimdRuntimeSimulationStepper,
} from "./simulationOptimized8WasmSimd";
import {
  createWasmSimdPackedRuntimeStepperBackend,
  runSimulationWasmSimdPackedBackend,
  type RuntimeSimulationStepper as WasmSimdPackedRuntimeSimulationStepper,
} from "./simulationOptimized9WasmSimdPacked";
import {
  createWasmSimdIntrinsicsRuntimeStepperBackend,
  runSimulationWasmSimdIntrinsicsBackend,
  type RuntimeSimulationStepper as WasmSimdIntrinsicsRuntimeSimulationStepper,
} from "./simulationOptimized10WasmSimdIntrinsics";
import {
  createCsrLayoutRuntimeStepperBackend,
  runSimulationCsrLayoutBackend,
  type RuntimeSimulationStepper as CsrLayoutRuntimeSimulationStepper,
} from "./simulationOptimized11CsrLayout";
import {
  createWasmCsrRuntimeStepperBackend,
  runSimulationWasmCsrBackend,
  type RuntimeSimulationStepper as WasmCsrRuntimeSimulationStepper,
} from "./simulationOptimized12WasmCsr";
import { DEFAULT_SIMULATION_BACKEND } from "./simulationDefaults";

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
  precision?: SimulationPrecision;
};

export type RuntimeSimulationStepper = {
  state: SimulationState;
  step: (steps?: number) => void;
};

function normalizeSubsteps(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  const rounded = Math.round(value ?? 1);
  if (rounded <= 1) {
    return 1;
  }
  if (rounded <= 2) {
    return 2;
  }
  if (rounded <= 4) {
    return 4;
  }
  if (rounded <= 8) {
    return 8;
  }
  return 8;
}

function estimateAdaptiveSubstepsFromCoeffs(coeffs: KoeffStr[], nodeCount: number, sampleRate: number): number {
  if (nodeCount <= 0 || sampleRate <= 0 || coeffs.length === 0) {
    return 1;
  }
  const rowAbs = new Float64Array(nodeCount);
  for (const coeff of coeffs) {
    rowAbs[coeff.i] += Math.abs(coeff.value);
  }
  let maxRowAbs = 0;
  for (let i = 0; i < rowAbs.length; i += 1) {
    maxRowAbs = Math.max(maxRowAbs, rowAbs[i]);
  }
  const stiffnessRatio = Math.sqrt(maxRowAbs) / sampleRate;
  if (stiffnessRatio > 0.12) {
    return 8;
  }
  if (stiffnessRatio > 0.06) {
    return 4;
  }
  if (stiffnessRatio > 0.03) {
    return 2;
  }
  return 1;
}

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
  vector: FloatArray,
  coeffs: KoeffStr[],
  out?: FloatArray,
): FloatArray {
  const result =
    out && out.length === n
      ? out
      : vector instanceof Float32Array
        ? new Float32Array(n)
        : new Float64Array(n);
  result.fill(0);
  for (const coeff of coeffs) {
    result[coeff.i] += coeff.value * vector[coeff.j];
  }
  return result;
}

export function sqrAnnuation(acceleration: FloatArray, velocity: FloatArray, squareAttenuation: number): void {
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
  springScratch?: FloatArray,
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
  u: FloatArray,
  v: FloatArray,
  coeffs: KoeffStr[],
  attenuation: number,
  squareAttenuation: number,
  out?: FloatArray,
): FloatArray {
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
  const backend = options?.backend ?? DEFAULT_SIMULATION_BACKEND;
  if (backend === "optimized") {
    return runSimulationOptimized(graph, params, onProgress, options);
  }
  if (backend === "edge-list") {
    return runSimulationEdgeList(graph, params, onProgress, options);
  }
  if (backend === "edge-types") {
    return runSimulationEdgeTypes(graph, params, onProgress, options);
  }
  if (backend === "compiled") {
    return runSimulationCompiledBackend(graph, params, onProgress, options);
  }
  if (backend === "fused-loop") {
    return runSimulationFusedLoopBackend(graph, params, onProgress, options);
  }
  if (backend === "sorted-edge-csr") {
    return runSimulationSortedEdgeCSRBackend(graph, params, onProgress, options);
  }
  if (backend === "wasm-hotloop") {
    return runSimulationWasmBackend(graph, params, onProgress, options);
  }
  if (backend === "wasm-hotloop-simd") {
    return runSimulationWasmSimdBackend(graph, params, onProgress, options);
  }
  if (backend === "wasm-hotloop-simd-packed") {
    return runSimulationWasmSimdPackedBackend(graph, params, onProgress, options);
  }
  if (backend === "wasm-hotloop-simd-intrinsics") {
    return runSimulationWasmSimdIntrinsicsBackend(graph, params, onProgress, options);
  }
  if (backend === "csr-layout-hybrid") {
    return runSimulationCsrLayoutBackend(graph, params, onProgress, options);
  }
  if (backend === "wasm-csr") {
    return runSimulationWasmCsrBackend(graph, params, onProgress, options);
  }
  return runSimulationLegacy(graph, params, onProgress, options);
}

export function createRuntimeSimulationStepper(
  graph: GraphData,
  params: SimulationParams,
  backend: SimulationBackend = DEFAULT_SIMULATION_BACKEND,
): RuntimeSimulationStepper {
  if (backend === "optimized") {
    return createOptimizedRuntimeStepper(graph, params) as OptimizedRuntimeSimulationStepper;
  }
  if (backend === "edge-list") {
    return createEdgeListRuntimeStepper(graph, params) as EdgeListRuntimeSimulationStepper;
  }
  if (backend === "edge-types") {
    return createEdgeTypesRuntimeStepper(graph, params) as EdgeTypesRuntimeSimulationStepper;
  }
  if (backend === "compiled") {
    return createCompiledRuntimeStepperBackend(graph, params) as CompiledRuntimeSimulationStepper;
  }
  if (backend === "fused-loop") {
    return createFusedLoopRuntimeStepperBackend(graph, params) as FusedLoopRuntimeSimulationStepper;
  }
  if (backend === "sorted-edge-csr") {
    return createSortedEdgeCSRRuntimeStepperBackend(graph, params) as SortedEdgeCSRRuntimeSimulationStepper;
  }
  if (backend === "wasm-hotloop") {
    return createWasmRuntimeStepperBackend(graph, params) as WasmRuntimeSimulationStepper;
  }
  if (backend === "wasm-hotloop-simd") {
    return createWasmSimdRuntimeStepperBackend(graph, params) as WasmSimdRuntimeSimulationStepper;
  }
  if (backend === "wasm-hotloop-simd-packed") {
    return createWasmSimdPackedRuntimeStepperBackend(graph, params) as WasmSimdPackedRuntimeSimulationStepper;
  }
  if (backend === "wasm-hotloop-simd-intrinsics") {
    return createWasmSimdIntrinsicsRuntimeStepperBackend(graph, params) as WasmSimdIntrinsicsRuntimeSimulationStepper;
  }
  if (backend === "csr-layout-hybrid") {
    return createCsrLayoutRuntimeStepperBackend(graph, params) as CsrLayoutRuntimeSimulationStepper;
  }
  if (backend === "wasm-csr") {
    return createWasmCsrRuntimeStepperBackend(graph, params) as WasmCsrRuntimeSimulationStepper;
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
  const fixedSubsteps = normalizeSubsteps(params.substeps);
  const adaptiveSubsteps = estimateAdaptiveSubstepsFromCoeffs(coeffs, totalDots, params.sampleRate);
  const resolveSubsteps = () => (params.substepsMode === "adaptive" ? adaptiveSubsteps : fixedSubsteps);
  const integrateOne =
    params.method === "runge-kutta"
      ? (stepDt: number) =>
        rungeKuttaStep(state, coeffs, stepDt, params.attenuation, params.squareAttenuation, rungeKuttaWorkspace)
      : (stepDt: number) =>
        eulerCramerStep(state, coeffs, stepDt, params.attenuation, params.squareAttenuation, eulerSpring);

  return {
    state,
    step(steps = 1) {
      for (let sample = 0; sample < steps; sample += 1) {
        const sampleSubsteps = resolveSubsteps();
        const sampleDt = dt / sampleSubsteps;
        for (let sub = 0; sub < sampleSubsteps; sub += 1) {
          integrateOne(sampleDt);
          for (const index of fixedIndices) {
            state.u[index] = 0;
            state.v[index] = 0;
          }
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
