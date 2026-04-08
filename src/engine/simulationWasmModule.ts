const moduleCache = new Map<string, WebAssembly.Module | null>();

export function decodeBase64ToBytes(base64: string): Uint8Array {
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

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

export function compileWasmModule(wasmBytes: ArrayBuffer): WebAssembly.Module | null {
  try {
    return new WebAssembly.Module(wasmBytes);
  } catch {
    return null;
  }
}

export function getCachedWasmModule(cacheKey: string, base64: string): WebAssembly.Module | null {
  if (moduleCache.has(cacheKey)) {
    return moduleCache.get(cacheKey) ?? null;
  }
  const module = compileWasmModule(toArrayBuffer(decodeBase64ToBytes(base64)));
  moduleCache.set(cacheKey, module);
  return module;
}
