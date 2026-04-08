import type {
  FloatArray,
  GraphData,
  SimulationCaptureMode,
  SimulationParams,
  SimulationPrecision,
  SimulationResult,
  SimulationState,
} from "./types";
import {
  compileGraph,
  createFusedLoopRuntimeStepper,
  runSimulationFusedLoop,
  type CompiledSimulationGraph,
  type RuntimeSimulationStepper as FusedLoopRuntimeSimulationStepper,
} from "./simulationOptimized5FusedLoop";
import { SIM_HOTLOOP_WASM_BASE64 } from "./wasm/sim_hotloop.wasm.base64";
import { SIM_HOTLOOP_F32_WASM_BASE64 } from "./wasm/sim_hotloop_f32.wasm.base64";

const DEFAULT_EDGE_FADE_MS = 2;

type RunSimulationOptions = {
  capture?: SimulationCaptureMode;
  precision?: SimulationPrecision;
};

type WasmExports = {
  memory: WebAssembly.Memory;
  init: (freeCount: number, freeFreeCount: number, freeFixedCount: number) => number;
  euler_step: (dt: number, attenuation: number, squareAttenuation: number) => void;
  rk4_step: (dt: number, attenuation: number, squareAttenuation: number) => void;
  get_offset_u: () => number;
  get_offset_v: () => number;
  get_offset_ff_edge_i: () => number;
  get_offset_ff_edge_j: () => number;
  get_offset_ff_k_over_mass_i: () => number;
  get_offset_ff_k_over_mass_j: () => number;
  get_offset_fixed_index: () => number;
  get_offset_fixed_k_over_mass: () => number;
};

type WasmKernel = {
  u: FloatArray;
  v: FloatArray;
  eulerStep: (dt: number, attenuation: number, squareAttenuation: number) => void;
  rk4Step: (dt: number, attenuation: number, squareAttenuation: number) => void;
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

function estimateAdaptiveSubstepsFromCompiled(compiled: CompiledSimulationGraph, sampleRate: number): number {
  if (sampleRate <= 0) {
    return 1;
  }
  let maxCoeff = 0;
  for (let i = 0; i < compiled.edges.freeFree.kOverMassI.length; i += 1) {
    maxCoeff = Math.max(
      maxCoeff,
      Math.abs(compiled.edges.freeFree.kOverMassI[i]),
      Math.abs(compiled.edges.freeFree.kOverMassJ[i]),
    );
  }
  for (let i = 0; i < compiled.edges.freeFixed.kOverMass.length; i += 1) {
    maxCoeff = Math.max(maxCoeff, Math.abs(compiled.edges.freeFixed.kOverMass[i]));
  }
  const stiffnessRatio = Math.sqrt(maxCoeff) / sampleRate;
  if (stiffnessRatio > 0.12) return 8;
  if (stiffnessRatio > 0.06) return 4;
  if (stiffnessRatio > 0.03) return 2;
  return 1;
}

function decodeBase64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return Uint8Array.from(Buffer.from(base64, "base64"));
  }

  const decoded = atob(base64);
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i += 1) {
    bytes[i] = decoded.charCodeAt(i);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function compileWasmModule(wasmBytes: ArrayBuffer): WebAssembly.Module | null {
  try {
    return new WebAssembly.Module(wasmBytes);
  } catch {
    return null;
  }
}

const cachedWasmModule = compileWasmModule(toArrayBuffer(decodeBase64ToBytes(SIM_HOTLOOP_WASM_BASE64)));
const cachedWasmModuleF32 = compileWasmModule(
  toArrayBuffer(decodeBase64ToBytes(SIM_HOTLOOP_F32_WASM_BASE64)),
);

function getWasmModule(): WebAssembly.Module | null {
  return cachedWasmModule;
}

function getWasmModuleF32(): WebAssembly.Module | null {
  return cachedWasmModuleF32;
}

function instantiateWasmExports(module: WebAssembly.Module): WasmExports | null {
  let instance: WebAssembly.Instance;
  try {
    instance = new WebAssembly.Instance(module, {});
  } catch {
    return null;
  }

  const exports = instance.exports as Partial<WasmExports>;
  if (
    !exports.memory ||
    !exports.init ||
    !exports.euler_step ||
    !exports.rk4_step ||
    !exports.get_offset_u ||
    !exports.get_offset_v ||
    !exports.get_offset_ff_edge_i ||
    !exports.get_offset_ff_edge_j ||
    !exports.get_offset_ff_k_over_mass_i ||
    !exports.get_offset_ff_k_over_mass_j ||
    !exports.get_offset_fixed_index ||
    !exports.get_offset_fixed_k_over_mass
  ) {
    return null;
  }

  return exports as WasmExports;
}

function createWasmKernelF64(compiled: CompiledSimulationGraph): WasmKernel | null {
  const module = getWasmModule();
  if (!module) {
    return null;
  }

  const exports = instantiateWasmExports(module);
  if (!exports) {
    return null;
  }

  const freeFree = compiled.edges.freeFree;
  const freeFixed = compiled.edges.freeFixed;
  const initResult = exports.init(
    compiled.freeCount,
    freeFree.edgeI.length,
    freeFixed.freeIndex.length,
  );
  if (!initResult) {
    return null;
  }

  const buffer = exports.memory.buffer;
  const u = new Float64Array(buffer, exports.get_offset_u(), compiled.freeCount);
  const v = new Float64Array(buffer, exports.get_offset_v(), compiled.freeCount);
  u.set(compiled.initialU);
  v.set(compiled.initialV);

  const ffEdgeI = new Uint32Array(buffer, exports.get_offset_ff_edge_i(), freeFree.edgeI.length);
  const ffEdgeJ = new Uint32Array(buffer, exports.get_offset_ff_edge_j(), freeFree.edgeJ.length);
  const ffKOverMassI = new Float64Array(buffer, exports.get_offset_ff_k_over_mass_i(), freeFree.kOverMassI.length);
  const ffKOverMassJ = new Float64Array(buffer, exports.get_offset_ff_k_over_mass_j(), freeFree.kOverMassJ.length);
  const fixedIndex = new Uint32Array(buffer, exports.get_offset_fixed_index(), freeFixed.freeIndex.length);
  const fixedKOverMass = new Float64Array(buffer, exports.get_offset_fixed_k_over_mass(), freeFixed.kOverMass.length);

  ffEdgeI.set(freeFree.edgeI);
  ffEdgeJ.set(freeFree.edgeJ);
  ffKOverMassI.set(freeFree.kOverMassI);
  ffKOverMassJ.set(freeFree.kOverMassJ);
  fixedIndex.set(freeFixed.freeIndex);
  fixedKOverMass.set(freeFixed.kOverMass);

  return {
    u,
    v,
    eulerStep: exports.euler_step,
    rk4Step: exports.rk4_step,
  };
}

function createWasmKernelF32(compiled: CompiledSimulationGraph): WasmKernel | null {
  const module = getWasmModuleF32();
  if (!module) {
    return null;
  }

  const exports = instantiateWasmExports(module);
  if (!exports) {
    return null;
  }

  const freeFree = compiled.edges.freeFree;
  const freeFixed = compiled.edges.freeFixed;
  const initResult = exports.init(
    compiled.freeCount,
    freeFree.edgeI.length,
    freeFixed.freeIndex.length,
  );
  if (!initResult) {
    return null;
  }

  const buffer = exports.memory.buffer;
  const u = new Float32Array(buffer, exports.get_offset_u(), compiled.freeCount);
  const v = new Float32Array(buffer, exports.get_offset_v(), compiled.freeCount);
  u.set(compiled.initialU);
  v.set(compiled.initialV);

  const ffEdgeI = new Uint32Array(buffer, exports.get_offset_ff_edge_i(), freeFree.edgeI.length);
  const ffEdgeJ = new Uint32Array(buffer, exports.get_offset_ff_edge_j(), freeFree.edgeJ.length);
  const ffKOverMassI = new Float32Array(buffer, exports.get_offset_ff_k_over_mass_i(), freeFree.kOverMassI.length);
  const ffKOverMassJ = new Float32Array(buffer, exports.get_offset_ff_k_over_mass_j(), freeFree.kOverMassJ.length);
  const fixedIndex = new Uint32Array(buffer, exports.get_offset_fixed_index(), freeFixed.freeIndex.length);
  const fixedKOverMass = new Float32Array(buffer, exports.get_offset_fixed_k_over_mass(), freeFixed.kOverMass.length);

  ffEdgeI.set(freeFree.edgeI);
  ffEdgeJ.set(freeFree.edgeJ);
  ffKOverMassI.set(freeFree.kOverMassI);
  ffKOverMassJ.set(freeFree.kOverMassJ);
  fixedIndex.set(freeFixed.freeIndex);
  fixedKOverMass.set(freeFixed.kOverMass);

  return {
    u,
    v,
    eulerStep: exports.euler_step,
    rk4Step: exports.rk4_step,
  };
}

export { compileGraph };
export type { CompiledSimulationGraph };

export function runSimulationWasm(
  compiled: CompiledSimulationGraph,
  params: SimulationParams,
  onProgress?: (completed: number, total: number) => void,
  options?: RunSimulationOptions,
): SimulationResult {
  const precision = options?.precision ?? 64;
  const kernel = precision === 32 ? createWasmKernelF32(compiled) : createWasmKernelF64(compiled);
  if (!kernel) {
    return runSimulationFusedLoop(compiled, params, onProgress, options);
  }

  const totalSamples = params.lengthK * 1024;
  const captureMode = options?.capture ?? "full";
  const captureFull = captureMode === "full";
  const dt = 1 / params.sampleRate;
  const fixedSubsteps = normalizeSubsteps(params.substeps);
  const adaptiveSubsteps = estimateAdaptiveSubstepsFromCompiled(compiled, params.sampleRate);
  const resolveSubsteps = () => (params.substepsMode === "adaptive" ? adaptiveSubsteps : fixedSubsteps);
  const integrateOne =
    params.method === "runge-kutta"
      ? (stepDt: number) => kernel.rk4Step(stepDt, params.attenuation, params.squareAttenuation)
      : (stepDt: number) => kernel.eulerStep(stepDt, params.attenuation, params.squareAttenuation);

  const frames = captureFull ? new Array<FloatArray>(totalSamples) : [];
  const playingPointBuffer = new Float32Array(totalSamples);
  const packedHistory: FloatArray | null = captureFull
    ? (precision === 32
        ? new Float32Array(totalSamples * compiled.totalDots)
        : new Float64Array(totalSamples * compiled.totalDots))
    : null;

  for (let sample = 0; sample < totalSamples; sample += 1) {
    const sampleSubsteps = resolveSubsteps();
    const sampleDt = dt / sampleSubsteps;
    for (let sub = 0; sub < sampleSubsteps; sub += 1) {
      integrateOne(sampleDt);
    }

    if (packedHistory) {
      const offset = sample * compiled.totalDots;
      for (let i = 0; i < compiled.freeToGlobal.length; i += 1) {
        packedHistory[offset + compiled.freeToGlobal[i]] = kernel.u[i];
      }
    }

    playingPointBuffer[sample] = compiled.playingPointFree >= 0 ? kernel.u[compiled.playingPointFree] ?? 0 : 0;

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

export function runSimulationWasmBackend(
  graph: GraphData,
  params: SimulationParams,
  onProgress?: (completed: number, total: number) => void,
  options?: RunSimulationOptions,
): SimulationResult {
  const compiled = compileGraph(graph, params, options?.precision ?? 64);
  return runSimulationWasm(compiled, params, onProgress, options);
}

export function createWasmRuntimeStepper(
  compiled: CompiledSimulationGraph,
  params: SimulationParams,
): RuntimeSimulationStepper {
  const precision: SimulationPrecision = compiled.initialU instanceof Float32Array ? 32 : 64;
  const kernel = precision === 32 ? createWasmKernelF32(compiled) : createWasmKernelF64(compiled);
  if (!kernel) {
    return createFusedLoopRuntimeStepper(compiled, params) as FusedLoopRuntimeSimulationStepper;
  }

  const dt = 1 / params.sampleRate;
  const fixedSubsteps = normalizeSubsteps(params.substeps);
  const adaptiveSubsteps = estimateAdaptiveSubstepsFromCompiled(compiled, params.sampleRate);
  const resolveSubsteps = () => (params.substepsMode === "adaptive" ? adaptiveSubsteps : fixedSubsteps);
  const integrateOne =
    params.method === "runge-kutta"
      ? (stepDt: number) => kernel.rk4Step(stepDt, params.attenuation, params.squareAttenuation)
      : (stepDt: number) => kernel.eulerStep(stepDt, params.attenuation, params.squareAttenuation);
  const state: SimulationState = {
    u: precision === 32 ? new Float32Array(compiled.totalDots) : new Float64Array(compiled.totalDots),
    v: precision === 32 ? new Float32Array(compiled.totalDots) : new Float64Array(compiled.totalDots),
  };

  for (let i = 0; i < compiled.freeToGlobal.length; i += 1) {
    const globalIndex = compiled.freeToGlobal[i];
    state.u[globalIndex] = kernel.u[i];
    state.v[globalIndex] = kernel.v[i];
  }

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
        state.u[globalIndex] = kernel.u[i];
        state.v[globalIndex] = kernel.v[i];
      }
    },
  };
}

export function createWasmRuntimeStepperBackend(
  graph: GraphData,
  params: SimulationParams,
): RuntimeSimulationStepper {
  const compiled = compileGraph(graph, params);
  return createWasmRuntimeStepper(compiled, params);
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
