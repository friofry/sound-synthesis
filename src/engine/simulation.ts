import type {
  FloatArray,
  GraphData,
  KoeffStr,
  SimulationBackend,
  SimulationParams,
  SimulationResult,
  SimulationState,
} from "./types";
import type {
  RunSimulationOptions as SharedRunSimulationOptions,
  RuntimeSimulationStepper as SharedRuntimeSimulationStepper,
} from "./simulationRuntimeTypes";
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
import {
  DEFAULT_SIMULATION_PRECISION,
  resolveDefaultSimulationBackend,
} from "../config/defaults";
import { forEachSpringLine } from "./simulationAssembly";
import { applyVelocityDamping } from "./simulationDamping";
import { applyEndFadeOut, applyStartFadeIn } from "./simulationFade";
import { createIntegratorStep } from "./simulationIntegratorBridge";
import { createRungeKuttaWorkspace, rungeKuttaStepShared } from "./simulationRk4";
import { clampFixedNodes, collectFixedIndices, initializeStateFromGraph } from "./simulationState";
import { resolveSampleSubsteps, substepsFromStiffnessRatio } from "./simulationSubsteps";

type RunSimulationOptions = SharedRunSimulationOptions;
export type RuntimeSimulationStepper = SharedRuntimeSimulationStepper;

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
  return substepsFromStiffnessRatio(Math.sqrt(maxRowAbs) / sampleRate);
}

export function createConnectionStructure(graph: GraphData): KoeffStr[] {
  const coeffs: KoeffStr[] = [];

  const addCoeff = (i: number, j: number, value: number) => {
    if (value !== 0) {
      coeffs.push({ i, j, value });
    }
  };

  forEachSpringLine(graph, (line, d1, d2) => {
    if (!d1.fixed && !d2.fixed) {
      addCoeff(line.dot1, line.dot1, -line.k / d1.weight);
      addCoeff(line.dot1, line.dot2, line.k / d1.weight);
      addCoeff(line.dot2, line.dot2, -line.k / d2.weight);
      addCoeff(line.dot2, line.dot1, line.k / d2.weight);
      return;
    }

    if (!d1.fixed) {
      addCoeff(line.dot1, line.dot1, -line.k / d1.weight);
    }
    if (!d2.fixed) {
      addCoeff(line.dot2, line.dot2, -line.k / d2.weight);
    }
  });

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
  applyVelocityDamping(acceleration, velocity, 0, squareAttenuation);
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
  workspace?: ReturnType<typeof createRungeKuttaWorkspace>,
): void {
  const ws = workspace ?? createRungeKuttaWorkspace(state.u.length);
  rungeKuttaStepShared(state, dt, ws, (u, v, out) =>
    void buildAcceleration(u, v, coeffs, attenuation, squareAttenuation, out),
  );
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
  applyVelocityDamping(acceleration, v, attenuation, squareAttenuation);
  return acceleration;
}

export function runSimulation(
  graph: GraphData,
  params: SimulationParams,
  onProgress?: (completed: number, total: number) => void,
  options?: RunSimulationOptions,
): SimulationResult {
  const precision = options?.precision ?? DEFAULT_SIMULATION_PRECISION;
  const backend = options?.backend ?? resolveDefaultSimulationBackend(params.method, precision);
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
  backend: SimulationBackend = resolveDefaultSimulationBackend(params.method, DEFAULT_SIMULATION_PRECISION),
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
  const state = initializeStateFromGraph(graph);
  const fixedIndices = collectFixedIndices(graph);

  const eulerSpring = new Float64Array(totalDots);
  const rungeKuttaWorkspace = createRungeKuttaWorkspace(totalDots);
  const adaptiveSubsteps = estimateAdaptiveSubstepsFromCoeffs(coeffs, totalDots, params.sampleRate);
  const resolveSubsteps = resolveSampleSubsteps(params, adaptiveSubsteps);
  const integrateOne = createIntegratorStep(
    params.method,
    (stepDt: number) =>
      eulerCramerStep(state, coeffs, stepDt, params.attenuation, params.squareAttenuation, eulerSpring),
    (stepDt: number) =>
      rungeKuttaStep(state, coeffs, stepDt, params.attenuation, params.squareAttenuation, rungeKuttaWorkspace),
  );

  return {
    state,
    step(steps = 1) {
      for (let sample = 0; sample < steps; sample += 1) {
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
