const PCM_FORMAT = 1;
const BITS_PER_SAMPLE = 16;
const WAV_HEADER_SIZE = 44;

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

export function encodeWavBlob(samples: Int16Array, sampleRate: number, channels = 1): Blob {
  if (!Number.isInteger(channels) || channels <= 0) {
    throw new Error("channels must be a positive integer");
  }
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error("sampleRate must be a positive number");
  }
  if (samples.length % channels !== 0) {
    throw new Error("samples length must be divisible by channels");
  }

  const dataSize = samples.length * Int16Array.BYTES_PER_ELEMENT;
  const byteRate = sampleRate * channels * (BITS_PER_SAMPLE / 8);
  const blockAlign = channels * (BITS_PER_SAMPLE / 8);
  const buffer = new ArrayBuffer(WAV_HEADER_SIZE + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");

  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, PCM_FORMAT, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, BITS_PER_SAMPLE, true);

  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = WAV_HEADER_SIZE;
  for (let i = 0; i < samples.length; i += 1) {
    view.setInt16(offset, samples[i], true);
    offset += Int16Array.BYTES_PER_ELEMENT;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export { WAV_HEADER_SIZE };
