/**
 * Pitch/HPS wasm mirrors `simulationOptimized7Wasm` / `simulationOptimized8WasmSimd`:
 * separate `.wasm` blobs from `src/engine/wasm/build.sh`, `getCachedWasmModule` keys,
 * and a SIMD variant (`-msimd128`, `pitch_analysis_simd.c` → includes `pitch_analysis.c`)
 * tried before the scalar module — same idea as `SIM_HOTLOOP_SIMD_WASM_BASE64` vs `SIM_HOTLOOP_WASM_BASE64`.
 */
import { getCachedWasmModule } from "../../engine/simulationWasmModule";
import { PITCH_ANALYSIS_SIMD_WASM_BASE64 } from "../../engine/wasm/pitch_analysis_simd.wasm.base64";
import { PITCH_ANALYSIS_WASM_BASE64 } from "../../engine/wasm/pitch_analysis.wasm.base64";

/** Must match `MAX_BINS` in src/engine/wasm/pitch_analysis.c */
export const PITCH_ANALYSIS_WASM_MAX_BINS = 16384;

type PitchWasmExports = {
  memory: WebAssembly.Memory;
  __heap_base?: WebAssembly.Global | number;
  find_dominant_decibels: (
    dataOff: number,
    binCount: number,
    sampleRate: number,
    minHz: number,
    maxHz: number,
  ) => number;
  find_dominant_linear_mag: (
    magOff: number,
    binCount: number,
    sampleRate: number,
    frameSize: number,
    minHz: number,
    maxHz: number,
  ) => number;
  find_dominant_spectrum_points: (
    freqOff: number,
    magOff: number,
    count: number,
    minHz: number,
    maxHz: number,
  ) => number;
  pick_loudest_frame_f64: (dataOff: number, frameCount: number, binCount: number) => number;
};

let cachedExports: PitchWasmExports | null | undefined;
let cachedPitchUsesSimd = false;

function readHeapBase(exports: Record<string, unknown>): number {
  const hb = exports.__heap_base;
  let raw = 65536;
  if (typeof hb === "number") {
    raw = hb;
  } else if (typeof hb === "object" && hb !== null && "value" in hb) {
    raw = Number((hb as { value: unknown }).value);
  }
  /* Avoid overwriting wasm globals/stack at the start of linear memory. */
  return Math.max(raw, 65536);
}

function align8(n: number): number {
  return (n + 7) & ~7;
}

function ensureMemoryBytes(memory: WebAssembly.Memory, required: number): void {
  while (memory.buffer.byteLength < required) {
    memory.grow(1);
  }
}

function getPitchWasmExports(): PitchWasmExports | null {
  if (cachedExports !== undefined) {
    return cachedExports;
  }
  const tryOrder: { key: string; base64: string; simd: boolean }[] = [
    { key: "pitch_analysis_simd_v1", base64: PITCH_ANALYSIS_SIMD_WASM_BASE64, simd: true },
    { key: "pitch_analysis_scalar_v1", base64: PITCH_ANALYSIS_WASM_BASE64, simd: false },
  ];
  for (const candidate of tryOrder) {
    const module = getCachedWasmModule(candidate.key, candidate.base64);
    if (!module) {
      continue;
    }
    let instance: WebAssembly.Instance;
    try {
      instance = new WebAssembly.Instance(module, {});
    } catch {
      continue;
    }
    const ex = instance.exports as Partial<PitchWasmExports>;
    if (
      !ex.memory ||
      !ex.find_dominant_decibels ||
      !ex.find_dominant_linear_mag ||
      !ex.find_dominant_spectrum_points ||
      !ex.pick_loudest_frame_f64
    ) {
      continue;
    }
    cachedExports = ex as PitchWasmExports;
    cachedPitchUsesSimd = candidate.simd;
    return cachedExports;
  }
  cachedExports = null;
  return null;
}

function hzOrNull(wasmHz: number): number | null {
  if (!Number.isFinite(wasmHz) || Number.isNaN(wasmHz)) {
    return null;
  }
  return wasmHz;
}

export function isPitchAnalysisWasmLoaded(): boolean {
  return getPitchWasmExports() !== null;
}

/** True when the SIMD wasm module was loaded (falls back to scalar if SIMD is unavailable). */
export function isPitchAnalysisWasmSimdBuild(): boolean {
  getPitchWasmExports();
  return cachedPitchUsesSimd;
}

/** Peak Hz from dBFS bins (same semantics as `findDominantFrequencyDecibels`). */
export function findDominantFrequencyDecibelsWasm(
  data: Float32Array,
  sampleRate: number,
  minHz: number,
  maxHz: number,
): number | null {
  if (data.length < 3 || data.length > PITCH_ANALYSIS_WASM_MAX_BINS || sampleRate <= 0) {
    return null;
  }
  const ex = getPitchWasmExports();
  if (!ex) {
    return null;
  }
  const heap = readHeapBase(ex as unknown as Record<string, unknown>);
  const byteLen = data.length * 4;
  ensureMemoryBytes(ex.memory, heap + byteLen + 4096);
  new Float32Array(ex.memory.buffer, heap, data.length).set(data);
  const hz = ex.find_dominant_decibels(heap, data.length, sampleRate, minHz, maxHz);
  return hzOrNull(hz);
}

export function findDominantFrequencyLinearMagnitudesWasm(
  magnitudes: Float64Array,
  sampleRate: number,
  frameSize: number,
  minHz: number,
  maxHz: number,
): number | null {
  if (magnitudes.length < 3 || magnitudes.length > PITCH_ANALYSIS_WASM_MAX_BINS || sampleRate <= 0 || frameSize <= 0) {
    return null;
  }
  const ex = getPitchWasmExports();
  if (!ex) {
    return null;
  }
  const heap = readHeapBase(ex as unknown as Record<string, unknown>);
  const byteLen = magnitudes.length * 8;
  ensureMemoryBytes(ex.memory, heap + byteLen + 4096);
  new Float64Array(ex.memory.buffer, heap, magnitudes.length).set(magnitudes);
  const hz = ex.find_dominant_linear_mag(heap, magnitudes.length, sampleRate, frameSize, minHz, maxHz);
  return hzOrNull(hz);
}

export function findDominantFrequencySpectrumPointsWasm(
  points: { frequency: number; magnitude: number }[],
  minHz: number,
  maxHz: number,
): number | null {
  const n = points.length;
  if (n < 3 || n > PITCH_ANALYSIS_WASM_MAX_BINS) {
    return null;
  }
  const ex = getPitchWasmExports();
  if (!ex) {
    return null;
  }
  const heap = readHeapBase(ex as unknown as Record<string, unknown>);
  const freqBytes = n * 8;
  const magOff = align8(heap + freqBytes);
  const end = magOff + n * 8;
  ensureMemoryBytes(ex.memory, end + 4096);
  const mem = ex.memory.buffer;
  const freq = new Float64Array(mem, heap, n);
  const mag = new Float64Array(mem, magOff, n);
  for (let i = 0; i < n; i += 1) {
    freq[i] = points[i].frequency;
    mag[i] = points[i].magnitude;
  }
  const hz = ex.find_dominant_spectrum_points(heap, magOff, n, minHz, maxHz);
  return hzOrNull(hz);
}

export function pickLoudestStftFrameIndexWasm(magnitudes: Float64Array[]): number {
  if (magnitudes.length === 0) {
    return 0;
  }
  const frameCount = magnitudes.length;
  const binCount = magnitudes[0].length;
  for (let f = 0; f < frameCount; f += 1) {
    if (magnitudes[f].length !== binCount) {
      return 0;
    }
  }
  const ex = getPitchWasmExports();
  if (!ex) {
    return 0;
  }
  const heap = readHeapBase(ex as unknown as Record<string, unknown>);
  const totalBytes = frameCount * binCount * 8;
  ensureMemoryBytes(ex.memory, heap + totalBytes + 4096);
  const flat = new Float64Array(ex.memory.buffer, heap, frameCount * binCount);
  let o = 0;
  for (let f = 0; f < frameCount; f += 1) {
    flat.set(magnitudes[f], o);
    o += binCount;
  }
  const idx = ex.pick_loudest_frame_f64(heap, frameCount, binCount);
  return idx >>> 0;
}

/** @internal testing */
export function resetPitchAnalysisWasmCacheForTests(): void {
  cachedExports = undefined;
  cachedPitchUsesSimd = false;
}
