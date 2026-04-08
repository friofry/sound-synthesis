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

export type RuntimeSimulationStepper = SharedRuntimeSimulationStepper;

function estimateAdaptiveSubstepsFromEdges(edges: EdgeList, sampleRate: number): number {
  if (sampleRate <= 0) {
    return 1;
  }
  let maxCoeff = 0;
  for (let i = 0; i < edges.kOverMassI.length; i += 1) {
    maxCoeff = Math.max(maxCoeff, Math.abs(edges.kOverMassI[i]), Math.abs(edges.kOverMassJ[i]));
  }
  for (let i = 0; i < edges.diagValue.length; i += 1) {
    maxCoeff = Math.max(maxCoeff, Math.abs(edges.diagValue[i]));
  }
  return substepsFromStiffnessRatio(Math.sqrt(maxCoeff) / sampleRate);
}

type RunSimulationOptions = Pick<SharedRunSimulationOptions, "capture">;

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
  const state: SimulationState = initializeStateFromGraph(graph);

  const eulerSpring = new Float64Array(totalDots);
  const rk = createRungeKuttaWorkspace(totalDots);
  const adaptiveSubsteps = estimateAdaptiveSubstepsFromEdges(edges, params.sampleRate);
  const resolveSubsteps = resolveSampleSubsteps(params, adaptiveSubsteps);
  const integrateOne = createIntegratorStep(
    params.method,
    (stepDt: number) =>
      eulerCramerStepEdgeList(state, edges, stepDt, params.attenuation, params.squareAttenuation, eulerSpring),
    (stepDt: number) =>
      rungeKuttaStepEdgeList(state, edges, stepDt, params.attenuation, params.squareAttenuation, rk),
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

function createEdgeList(graph: GraphData): EdgeList {
  const edgeI: number[] = [];
  const edgeJ: number[] = [];
  const kOverMassI: number[] = [];
  const kOverMassJ: number[] = [];
  const diagIndex: number[] = [];
  const diagValue: number[] = [];

  forEachSpringLine(graph, (line, d1, d2) => {
    if (!d1.fixed && !d2.fixed) {
      edgeI.push(line.dot1);
      edgeJ.push(line.dot2);
      kOverMassI.push(line.k / d1.weight);
      kOverMassJ.push(line.k / d2.weight);
      return;
    }

    if (!d1.fixed) {
      diagIndex.push(line.dot1);
      diagValue.push(-line.k / d1.weight);
    }
    if (!d2.fixed) {
      diagIndex.push(line.dot2);
      diagValue.push(-line.k / d2.weight);
    }
  });

  return {
    edgeI: Uint32Array.from(edgeI),
    edgeJ: Uint32Array.from(edgeJ),
    kOverMassI: Float64Array.from(kOverMassI),
    kOverMassJ: Float64Array.from(kOverMassJ),
    diagIndex: Uint32Array.from(diagIndex),
    diagValue: Float64Array.from(diagValue),
  };
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
  applyVelocityDamping(spring, v, attenuation, squareAttenuation);

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

