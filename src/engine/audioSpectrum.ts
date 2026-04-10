export type SpectrumAlgorithm = "dft" | "fft";

export type SpectrumPoint = {
  frequency: number;
  magnitude: number;
};

type BufferSpectrumOptions = {
  algorithm?: SpectrumAlgorithm;
  frameSize?: number;
  binCount?: number;
  minSampleCount?: number;
  normalize?: boolean;
};

type LogBandOptions = {
  barCount: number;
  minFrequency: number;
  maxFrequency: number;
  magnitudeTransform?: "none" | "sqrt";
};

type DecibelBandOptions = {
  barCount: number;
  minFrequency: number;
  maxFrequency: number;
  minDecibels: number;
  maxDecibels: number;
};

const DEFAULT_FRAME_SIZE = 1024;
const DEFAULT_MIN_SAMPLE_COUNT = 64;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isPowerOfTwo(value: number): boolean {
  return value > 0 && (value & (value - 1)) === 0;
}

function normalizeFrameSize(frameSize?: number): number {
  const safeFrameSize = Math.max(2, Math.floor(frameSize ?? DEFAULT_FRAME_SIZE));
  return safeFrameSize;
}

function buildPaddedFrame(buffer: Float32Array, frameSize: number): Float64Array {
  const frame = new Float64Array(frameSize);
  frame.set(buffer.subarray(0, Math.min(buffer.length, frameSize)));
  return frame;
}

function normalizeSpectrum(points: SpectrumPoint[]): SpectrumPoint[] {
  const maxMagnitude = points.reduce((max, point) => Math.max(max, point.magnitude), 0);
  if (maxMagnitude <= 0) {
    return points.map((point) => ({ ...point, magnitude: 0 }));
  }

  return points.map((point) => ({
    ...point,
    magnitude: point.magnitude / maxMagnitude,
  }));
}

function computeDftSpectrum(frame: Float64Array, sampleRate: number, binCount: number): SpectrumPoint[] {
  const size = frame.length;
  const spectrum: SpectrumPoint[] = [];

  for (let bin = 1; bin <= binCount; bin += 1) {
    let real = 0;
    let imag = 0;
    for (let sampleIndex = 0; sampleIndex < size; sampleIndex += 1) {
      const angle = (2 * Math.PI * bin * sampleIndex) / size;
      real += frame[sampleIndex] * Math.cos(angle);
      imag -= frame[sampleIndex] * Math.sin(angle);
    }

    spectrum.push({
      frequency: (bin * sampleRate) / size,
      magnitude: Math.hypot(real, imag) / size,
    });
  }

  return spectrum;
}

function reverseBits(value: number, bitCount: number): number {
  let reversed = 0;
  for (let bit = 0; bit < bitCount; bit += 1) {
    reversed = (reversed << 1) | ((value >> bit) & 1);
  }
  return reversed;
}

function computeFftSpectrum(frame: Float64Array, sampleRate: number, binCount: number): SpectrumPoint[] {
  const size = frame.length;
  if (!isPowerOfTwo(size)) {
    throw new Error(`FFT frameSize must be a power of two, got ${size}`);
  }

  const bitCount = Math.log2(size);
  const real = new Float64Array(size);
  const imag = new Float64Array(size);

  for (let index = 0; index < size; index += 1) {
    const reversedIndex = reverseBits(index, bitCount);
    real[reversedIndex] = frame[index];
  }

  for (let blockSize = 2; blockSize <= size; blockSize *= 2) {
    const halfBlock = blockSize / 2;
    const angleStep = (-2 * Math.PI) / blockSize;

    for (let blockStart = 0; blockStart < size; blockStart += blockSize) {
      for (let pairIndex = 0; pairIndex < halfBlock; pairIndex += 1) {
        const evenIndex = blockStart + pairIndex;
        const oddIndex = evenIndex + halfBlock;
        const angle = angleStep * pairIndex;
        const twiddleReal = Math.cos(angle);
        const twiddleImag = Math.sin(angle);
        const oddReal = real[oddIndex] * twiddleReal - imag[oddIndex] * twiddleImag;
        const oddImag = real[oddIndex] * twiddleImag + imag[oddIndex] * twiddleReal;

        real[oddIndex] = real[evenIndex] - oddReal;
        imag[oddIndex] = imag[evenIndex] - oddImag;
        real[evenIndex] += oddReal;
        imag[evenIndex] += oddImag;
      }
    }
  }

  const spectrum: SpectrumPoint[] = [];
  for (let bin = 1; bin <= binCount; bin += 1) {
    spectrum.push({
      frequency: (bin * sampleRate) / size,
      magnitude: Math.hypot(real[bin], imag[bin]) / size,
    });
  }

  return spectrum;
}

export function computeBufferSpectrum(
  buffer: Float32Array | null,
  sampleRate: number,
  options: BufferSpectrumOptions = {},
): SpectrumPoint[] {
  const minSampleCount = Math.max(1, Math.floor(options.minSampleCount ?? DEFAULT_MIN_SAMPLE_COUNT));
  if (!buffer || buffer.length < minSampleCount || sampleRate <= 0) {
    return [];
  }

  const frameSize = normalizeFrameSize(options.frameSize);
  const maxPositiveBinCount = Math.max(0, Math.floor(frameSize / 2) - 1);
  if (maxPositiveBinCount === 0) {
    return [];
  }

  const binCount = clamp(
    Math.floor(options.binCount ?? maxPositiveBinCount),
    1,
    maxPositiveBinCount,
  );
  const frame = buildPaddedFrame(buffer, frameSize);
  const spectrum = (options.algorithm ?? "fft") === "dft"
    ? computeDftSpectrum(frame, sampleRate, binCount)
    : computeFftSpectrum(frame, sampleRate, binCount);

  return options.normalize === false ? spectrum : normalizeSpectrum(spectrum);
}

function getLogBandRange(index: number, barCount: number, minFrequency: number, maxFrequency: number): [number, number] {
  const logMin = Math.log(minFrequency);
  const logRange = Math.max(1e-9, Math.log(Math.max(maxFrequency, minFrequency + 1e-6)) - logMin);
  const startFrequency = Math.exp(logMin + (index / barCount) * logRange);
  const endFrequency = Math.exp(logMin + ((index + 1) / barCount) * logRange);
  return [startFrequency, endFrequency];
}

export function projectSpectrumToLogBands(
  spectrum: SpectrumPoint[],
  options: LogBandOptions,
): number[] {
  const values = new Array(options.barCount).fill(0);
  if (!spectrum.length || options.barCount <= 0 || options.maxFrequency <= options.minFrequency) {
    return values;
  }

  const transform = options.magnitudeTransform ?? "none";
  for (let index = 0; index < options.barCount; index += 1) {
    const [startFrequency, endFrequency] = getLogBandRange(
      index,
      options.barCount,
      options.minFrequency,
      options.maxFrequency,
    );

    let maxMagnitude = 0;
    for (let pointIndex = 0; pointIndex < spectrum.length; pointIndex += 1) {
      const point = spectrum[pointIndex];
      if (point.frequency < startFrequency || point.frequency > endFrequency) {
        continue;
      }
      if (point.magnitude > maxMagnitude) {
        maxMagnitude = point.magnitude;
      }
    }

    values[index] = transform === "sqrt" ? Math.sqrt(maxMagnitude) : maxMagnitude;
  }

  return values;
}

export function projectDecibelSpectrumToLogBands(
  data: Float32Array,
  sampleRate: number,
  options: DecibelBandOptions,
): number[] {
  const values = new Array(options.barCount).fill(0);
  if (
    data.length < 2 ||
    sampleRate <= 0 ||
    options.barCount <= 0 ||
    options.maxFrequency <= options.minFrequency
  ) {
    return values;
  }

  const nyquist = sampleRate / 2;
  const minDb = Number.isFinite(options.minDecibels) ? options.minDecibels : -96;
  const maxDb = Number.isFinite(options.maxDecibels) ? options.maxDecibels : -12;
  const dbRange = Math.max(1e-6, maxDb - minDb);

  for (let index = 0; index < options.barCount; index += 1) {
    const [startFrequency, endFrequency] = getLogBandRange(
      index,
      options.barCount,
      options.minFrequency,
      Math.min(options.maxFrequency, nyquist),
    );
    const startBin = clamp(Math.floor((startFrequency / nyquist) * data.length), 1, data.length - 1);
    const endBin = clamp(Math.ceil((endFrequency / nyquist) * data.length), startBin, data.length - 1);

    let maxBinDb = minDb;
    for (let bin = startBin; bin <= endBin; bin += 1) {
      const value = data[bin] ?? minDb;
      if (value > maxBinDb) {
        maxBinDb = value;
      }
    }

    values[index] = clamp((maxBinDb - minDb) / dbRange, 0, 1);
  }

  return values;
}
