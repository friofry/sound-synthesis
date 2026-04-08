import type {
  FloatArray,
  GraphData,
  SimulationParams,
  SimulationPrecision,
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
import { rungeKuttaStepShared } from "./simulationRk4";
import { resolveSampleSubsteps, substepsFromStiffnessRatio } from "./simulationSubsteps";

type FreeFreeEdges = {
  edgeI: Uint32Array;
  edgeJ: Uint32Array;
  kOverMassI: FloatArray;
  kOverMassJ: FloatArray;
};

type FreeFixedEdges = {
  freeIndex: Uint32Array;
  kOverMass: FloatArray;
};

type SplitEdges = {
  freeFree: FreeFreeEdges;
  freeFixed: FreeFixedEdges;
};

type FreeNodeMapping = {
  freeToGlobal: Uint32Array;
  globalToFree: Int32Array;
  initialU: FloatArray;
  initialV: FloatArray;
};

export type RuntimeSimulationStepper = SharedRuntimeSimulationStepper;

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
  return substepsFromStiffnessRatio(Math.sqrt(maxCoeff) / sampleRate);
}

export type CompiledSimulationGraph = {
  totalDots: number;
  freeCount: number;
  freeToGlobal: Uint32Array;
  globalToFree: Int32Array;
  initialU: FloatArray;
  initialV: FloatArray;
  edges: SplitEdges;
  playingPointGlobal: number;
  playingPointFree: number;
};

type RunSimulationOptions = Pick<SharedRunSimulationOptions, "capture" | "precision">;

function createFloatArray(length: number, precision: SimulationPrecision): FloatArray {
  return precision === 32 ? new Float32Array(length) : new Float64Array(length);
}

function toFloatArray(values: number[], precision: SimulationPrecision): FloatArray {
  return precision === 32 ? Float32Array.from(values) : Float64Array.from(values);
}

export function compileGraph(
  graph: GraphData,
  params: Pick<SimulationParams, "playingPoint">,
  precision: SimulationPrecision = 64,
): CompiledSimulationGraph {
  const totalDots = graph.dots.length;
  const mapping = createFreeNodeMapping(graph, precision);
  const edges = createSplitEdges(graph, mapping.globalToFree, precision);
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

export function runSimulationFusedLoop(
  compiled: CompiledSimulationGraph,
  params: SimulationParams,
  onProgress?: (completed: number, total: number) => void,
  options?: RunSimulationOptions,
): SimulationResult {
  const precision = options?.precision ?? 64;
  const totalSamples = params.lengthK * 1024;
  const captureMode = options?.capture ?? "full";
  const captureFull = captureMode === "full";

  const state: SimulationState = {
    u: compiled.initialU.slice(),
    v: compiled.initialV.slice(),
  };
  const springScratch = createFloatArray(compiled.freeCount, precision);
  const rk = createRungeKuttaWorkspace(compiled.freeCount, precision);
  const dt = 1 / params.sampleRate;
  const adaptiveSubsteps = estimateAdaptiveSubstepsFromEdges(compiled.edges, params.sampleRate);
  const resolveSubsteps = resolveSampleSubsteps(params, adaptiveSubsteps);
  const integrateOne = createIntegratorStep(
    params.method,
    (stepDt: number) =>
      eulerCramerStep(state, compiled.edges, stepDt, params.attenuation, params.squareAttenuation, springScratch),
    (stepDt: number) =>
      rungeKuttaStep(state, compiled.edges, stepDt, params.attenuation, params.squareAttenuation, rk),
  );

  const frames = captureFull ? new Array<FloatArray>(totalSamples) : [];
  const playingPointBuffer = new Float32Array(totalSamples);
  const packedHistory = captureFull ? createFloatArray(totalSamples * compiled.totalDots, precision) : null;

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

export function runSimulationFusedLoopBackend(
  graph: GraphData,
  params: SimulationParams,
  onProgress?: (completed: number, total: number) => void,
  options?: RunSimulationOptions,
): SimulationResult {
  const compiled = compileGraph(graph, params, options?.precision ?? 64);
  return runSimulationFusedLoop(compiled, params, onProgress, options);
}

export function createFusedLoopRuntimeStepper(
  compiled: CompiledSimulationGraph,
  params: SimulationParams,
  precision: SimulationPrecision = 64,
): RuntimeSimulationStepper {
  const dt = 1 / params.sampleRate;
  const state: SimulationState = {
    u: createFloatArray(compiled.totalDots, precision),
    v: createFloatArray(compiled.totalDots, precision),
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

  const springScratch = createFloatArray(compiled.freeCount, precision);
  const rk = createRungeKuttaWorkspace(compiled.freeCount, precision);
  const adaptiveSubsteps = estimateAdaptiveSubstepsFromEdges(compiled.edges, params.sampleRate);
  const resolveSubsteps = resolveSampleSubsteps(params, adaptiveSubsteps);
  const integrateOne = createIntegratorStep(
    params.method,
    (stepDt: number) =>
      eulerCramerStep(
        dynamicState,
        compiled.edges,
        stepDt,
        params.attenuation,
        params.squareAttenuation,
        springScratch,
      ),
    (stepDt: number) =>
      rungeKuttaStep(
        dynamicState,
        compiled.edges,
        stepDt,
        params.attenuation,
        params.squareAttenuation,
        rk,
      ),
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

export function createFusedLoopRuntimeStepperBackend(
  graph: GraphData,
  params: SimulationParams,
): RuntimeSimulationStepper {
  const compiled = compileGraph(graph, params, 64);
  return createFusedLoopRuntimeStepper(compiled, params, 64);
}

// ---------------------------------------------------------------------------
// Graph compilation helpers
// ---------------------------------------------------------------------------

function createSplitEdges(
  graph: GraphData,
  globalToFree: Int32Array,
  precision: SimulationPrecision,
): SplitEdges {
  const edgeI: number[] = [];
  const edgeJ: number[] = [];
  const kOverMassI: number[] = [];
  const kOverMassJ: number[] = [];
  const freeIndex: number[] = [];
  const kOverMass: number[] = [];

  forEachSpringLine(graph, (line, d1, d2) => {
    if (!d1.fixed && !d2.fixed) {
      edgeI.push(globalToFree[line.dot1]);
      edgeJ.push(globalToFree[line.dot2]);
      kOverMassI.push(line.k / d1.weight);
      kOverMassJ.push(line.k / d2.weight);
      return;
    }

    if (!d1.fixed) {
      freeIndex.push(globalToFree[line.dot1]);
      kOverMass.push(-line.k / d1.weight);
    }
    if (!d2.fixed) {
      freeIndex.push(globalToFree[line.dot2]);
      kOverMass.push(-line.k / d2.weight);
    }
  });

  return {
    freeFree: {
      edgeI: Uint32Array.from(edgeI),
      edgeJ: Uint32Array.from(edgeJ),
      kOverMassI: toFloatArray(kOverMassI, precision),
      kOverMassJ: toFloatArray(kOverMassJ, precision),
    },
    freeFixed: {
      freeIndex: Uint32Array.from(freeIndex),
      kOverMass: toFloatArray(kOverMass, precision),
    },
  };
}

function createFreeNodeMapping(graph: GraphData, precision: SimulationPrecision): FreeNodeMapping {
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
    initialU: toFloatArray(initialU, precision),
    initialV: toFloatArray(initialV, precision),
  };
}

// ---------------------------------------------------------------------------
// Physics: spring acceleration (edge scatter — kept as separate pass)
// ---------------------------------------------------------------------------

function computeSpringAcceleration(u: FloatArray, edges: SplitEdges, out: FloatArray): void {
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
}

// ---------------------------------------------------------------------------
// Physics: fused acceleration = spring + linear damping + square damping
// ---------------------------------------------------------------------------

function buildAcceleration(
  u: FloatArray,
  v: FloatArray,
  edges: SplitEdges,
  attenuation: number,
  squareAttenuation: number,
  out: FloatArray,
): void {
  computeSpringAcceleration(u, edges, out);
  applyVelocityDamping(out, v, attenuation, squareAttenuation);
}

// ---------------------------------------------------------------------------
// Integrators
// ---------------------------------------------------------------------------

function eulerCramerStep(
  state: SimulationState,
  edges: SplitEdges,
  dt: number,
  attenuation: number,
  squareAttenuation: number,
  springScratch: FloatArray,
): void {
  const { u, v } = state;
  computeSpringAcceleration(u, edges, springScratch);
  applyVelocityDamping(springScratch, v, attenuation, squareAttenuation);

  for (let i = 0; i < u.length; i += 1) {
    const acc = springScratch[i];
    v[i] += acc * dt;
    u[i] += v[i] * dt;
  }
}

function rungeKuttaStep(
  state: SimulationState,
  edges: SplitEdges,
  dt: number,
  attenuation: number,
  squareAttenuation: number,
  workspace: RungeKuttaWorkspace,
): void {
  rungeKuttaStepShared(state, dt, workspace, (u, v, out) =>
    void buildAcceleration(u, v, edges, attenuation, squareAttenuation, out),
  );
}

// ---------------------------------------------------------------------------
// Workspace allocation
// ---------------------------------------------------------------------------

function createRungeKuttaWorkspace(n: number, precision: SimulationPrecision): RungeKuttaWorkspace {
  return {
    k1u: createFloatArray(n, precision),
    k1v: createFloatArray(n, precision),
    u2: createFloatArray(n, precision),
    v2: createFloatArray(n, precision),
    u3: createFloatArray(n, precision),
    v3: createFloatArray(n, precision),
    u4: createFloatArray(n, precision),
    v4: createFloatArray(n, precision),
    k2v: createFloatArray(n, precision),
    k3v: createFloatArray(n, precision),
    k4v: createFloatArray(n, precision),
  };
}

// ---------------------------------------------------------------------------
// Edge fades
// ---------------------------------------------------------------------------

