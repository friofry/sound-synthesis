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
  compileGraph as compileGraphCsr64,
  createSortedEdgeCSRRuntimeStepper,
  runSimulationSortedEdgeCSR,
  type CompiledSimulationGraph as CompiledCsrGraph64,
  type RuntimeSimulationStepper as SortedEdgeRuntimeSimulationStepper,
} from "./simulationOptimized6SortedEdgeCSR";
import { SIM_HOTLOOP_CSR_WASM_BASE64 } from "./wasm/sim_hotloop_csr.wasm.base64";
import { SIM_HOTLOOP_CSR_F32_WASM_BASE64 } from "./wasm/sim_hotloop_csr_f32.wasm.base64";

const DEFAULT_EDGE_FADE_MS = 2;

type RunSimulationOptions = {
  capture?: SimulationCaptureMode;
  precision?: SimulationPrecision;
};

type CompiledSimulationGraph = {
  precision: SimulationPrecision;
  totalDots: number;
  freeCount: number;
  freeToGlobal: Uint32Array;
  initialU: FloatArray;
  initialV: FloatArray;
  csr: {
    rowPtr: Uint32Array;
    col: Uint32Array;
    coeff: FloatArray;
    diag: FloatArray;
  };
  playingPointFree: number;
  fallback: CompiledCsrGraph64;
};

type WasmExports = {
  memory: WebAssembly.Memory;
  init: (freeCount: number, rowPtrLen: number, nnz: number) => number;
  euler_step: (dt: number, attenuation: number, squareAttenuation: number) => void;
  get_offset_u: () => number;
  get_offset_v: () => number;
  get_offset_row_ptr: () => number;
  get_offset_col: () => number;
  get_offset_coeff: () => number;
  get_offset_diag: () => number;
};

type WasmKernel = {
  precision: SimulationPrecision;
  u: FloatArray;
  v: FloatArray;
  eulerStep: (dt: number, attenuation: number, squareAttenuation: number) => void;
};

export type RuntimeSimulationStepper = {
  state: SimulationState;
  step: (steps?: number) => void;
};

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

const cachedModuleF64 = compileWasmModule(toArrayBuffer(decodeBase64ToBytes(SIM_HOTLOOP_CSR_WASM_BASE64)));
const cachedModuleF32 = compileWasmModule(toArrayBuffer(decodeBase64ToBytes(SIM_HOTLOOP_CSR_F32_WASM_BASE64)));

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
    !exports.get_offset_u ||
    !exports.get_offset_v ||
    !exports.get_offset_row_ptr ||
    !exports.get_offset_col ||
    !exports.get_offset_coeff ||
    !exports.get_offset_diag
  ) {
    return null;
  }
  return exports as WasmExports;
}

function toCompiledGraph(graph: CompiledCsrGraph64, precision: SimulationPrecision): CompiledSimulationGraph {
  return {
    precision,
    totalDots: graph.totalDots,
    freeCount: graph.freeCount,
    freeToGlobal: graph.freeToGlobal,
    initialU: precision === 32 ? Float32Array.from(graph.initialU) : graph.initialU.slice(),
    initialV: precision === 32 ? Float32Array.from(graph.initialV) : graph.initialV.slice(),
    csr: {
      rowPtr: graph.csr.rowPtr,
      col: graph.csr.col,
      coeff: precision === 32 ? Float32Array.from(graph.csr.coeff) : graph.csr.coeff.slice(),
      diag: precision === 32 ? Float32Array.from(graph.csr.diag) : graph.csr.diag.slice(),
    },
    playingPointFree: graph.playingPointFree,
    fallback: graph,
  };
}

export function compileGraph(
  graph: GraphData,
  params: Pick<SimulationParams, "playingPoint">,
  precision: SimulationPrecision = 64,
): CompiledSimulationGraph {
  return toCompiledGraph(compileGraphCsr64(graph, params), precision);
}

function createWasmKernel(compiled: CompiledSimulationGraph): WasmKernel | null {
  const module = compiled.precision === 32 ? cachedModuleF32 : cachedModuleF64;
  if (!module) {
    return null;
  }

  const exports = instantiateWasmExports(module);
  if (!exports) {
    return null;
  }

  const initResult = exports.init(compiled.freeCount, compiled.csr.rowPtr.length, compiled.csr.col.length);
  if (!initResult) {
    return null;
  }

  const buffer = exports.memory.buffer;
  const u =
    compiled.precision === 32
      ? new Float32Array(buffer, exports.get_offset_u(), compiled.freeCount)
      : new Float64Array(buffer, exports.get_offset_u(), compiled.freeCount);
  const v =
    compiled.precision === 32
      ? new Float32Array(buffer, exports.get_offset_v(), compiled.freeCount)
      : new Float64Array(buffer, exports.get_offset_v(), compiled.freeCount);
  const rowPtr = new Uint32Array(buffer, exports.get_offset_row_ptr(), compiled.csr.rowPtr.length);
  const col = new Uint32Array(buffer, exports.get_offset_col(), compiled.csr.col.length);
  const coeff =
    compiled.precision === 32
      ? new Float32Array(buffer, exports.get_offset_coeff(), compiled.csr.coeff.length)
      : new Float64Array(buffer, exports.get_offset_coeff(), compiled.csr.coeff.length);
  const diag =
    compiled.precision === 32
      ? new Float32Array(buffer, exports.get_offset_diag(), compiled.csr.diag.length)
      : new Float64Array(buffer, exports.get_offset_diag(), compiled.csr.diag.length);

  u.set(compiled.initialU);
  v.set(compiled.initialV);
  rowPtr.set(compiled.csr.rowPtr);
  col.set(compiled.csr.col);
  coeff.set(compiled.csr.coeff);
  diag.set(compiled.csr.diag);

  return {
    precision: compiled.precision,
    u,
    v,
    eulerStep: exports.euler_step,
  };
}

export function runSimulationWasmCsr(
  compiled: CompiledSimulationGraph,
  params: SimulationParams,
  onProgress?: (completed: number, total: number) => void,
  options?: RunSimulationOptions,
): SimulationResult {
  if (params.method !== "euler") {
    return runSimulationSortedEdgeCSR(compiled.fallback, params, onProgress, options);
  }

  const kernel = createWasmKernel(compiled);
  if (!kernel) {
    return runSimulationSortedEdgeCSR(compiled.fallback, params, onProgress, options);
  }

  const totalSamples = params.lengthK * 1024;
  const captureMode = options?.capture ?? "full";
  const captureFull = captureMode === "full";
  const dt = 1 / params.sampleRate;

  const frames = captureFull ? new Array<FloatArray>(totalSamples) : [];
  const playingPointBuffer = new Float32Array(totalSamples);
  const packedHistory: FloatArray | null = captureFull
    ? (compiled.precision === 32
        ? new Float32Array(totalSamples * compiled.totalDots)
        : new Float64Array(totalSamples * compiled.totalDots))
    : null;

  for (let sample = 0; sample < totalSamples; sample += 1) {
    kernel.eulerStep(dt, params.attenuation, params.squareAttenuation);

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

export function runSimulationWasmCsrBackend(
  graph: GraphData,
  params: SimulationParams,
  onProgress?: (completed: number, total: number) => void,
  options?: RunSimulationOptions,
): SimulationResult {
  const compiled = compileGraph(graph, params, options?.precision ?? 64);
  return runSimulationWasmCsr(compiled, params, onProgress, options);
}

export function createWasmCsrRuntimeStepper(
  compiled: CompiledSimulationGraph,
  params: SimulationParams,
): RuntimeSimulationStepper {
  if (params.method !== "euler") {
    return createSortedEdgeCSRRuntimeStepper(compiled.fallback, params) as SortedEdgeRuntimeSimulationStepper;
  }

  const kernel = createWasmKernel(compiled);
  if (!kernel) {
    return createSortedEdgeCSRRuntimeStepper(compiled.fallback, params) as SortedEdgeRuntimeSimulationStepper;
  }

  const dt = 1 / params.sampleRate;
  const state: SimulationState = {
    u: compiled.precision === 32 ? new Float32Array(compiled.totalDots) : new Float64Array(compiled.totalDots),
    v: compiled.precision === 32 ? new Float32Array(compiled.totalDots) : new Float64Array(compiled.totalDots),
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
        kernel.eulerStep(dt, params.attenuation, params.squareAttenuation);
      }

      for (let i = 0; i < compiled.freeToGlobal.length; i += 1) {
        const globalIndex = compiled.freeToGlobal[i];
        state.u[globalIndex] = kernel.u[i];
        state.v[globalIndex] = kernel.v[i];
      }
    },
  };
}

export function createWasmCsrRuntimeStepperBackend(
  graph: GraphData,
  params: SimulationParams,
): RuntimeSimulationStepper {
  const compiled = compileGraph(graph, params);
  return createWasmCsrRuntimeStepper(compiled, params);
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
