export function floatToInt16Pcm(buffer: Float32Array): Int16Array {
  const out = new Int16Array(buffer.length);
  for (let i = 0; i < buffer.length; i += 1) {
    const value = Math.max(-1, Math.min(1, buffer[i]));
    out[i] = value < 0 ? Math.round(value * 32768) : Math.round(value * 32767);
  }
  return out;
}
