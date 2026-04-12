/**
 * Gaussian white noise (Box–Muller), with amplitude scaling inspired by the legacy C++ GaussNoise
 * (points / dispersion ratio × maxAmplitude / 32767).
 */

export type GaussNoiseParams = {
  sampleRate: number;
  durationSeconds: number;
  /** Grid resolution used in the legacy tool (default 250). */
  points: number;
  /** Width parameter matching legacy `dispersion` (often ~points/100). */
  dispersion: number;
  /** Peak scale in the spirit of 16-bit amplitude (legacy default 5000). */
  maxAmplitude: number;
  /** If set, output is reproducible. */
  seed?: number;
};

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function* gaussianStream(random: () => number): Generator<number, never, void> {
  let spare: number | undefined;
  while (true) {
    if (spare !== undefined) {
      const z = spare;
      spare = undefined;
      yield z;
      continue;
    }
    let u = 0;
    let v = 0;
    while (u === 0) {
      u = random();
    }
    while (v === 0) {
      v = random();
    }
    const mag = Math.sqrt(-2 * Math.log(u));
    spare = mag * Math.cos(Math.PI * 2 * v);
    yield mag * Math.sin(Math.PI * 2 * v);
  }
}

/**
 * Legacy-style scale: (points/100)/dispersion × (maxAmplitude/32767).
 * When dispersion ≈ points/100, this matches a unit factor like the original defaults.
 */
function amplitudeScale(points: number, dispersion: number, maxAmplitude: number): number {
  const denom = Math.max(1e-9, dispersion);
  const legacyRatio = (points / 100) / denom;
  return (maxAmplitude / 32767) * legacyRatio;
}

export function generateGaussNoiseBuffer(params: GaussNoiseParams): Float32Array {
  if (!Number.isFinite(params.sampleRate) || params.sampleRate <= 0) {
    throw new Error("sampleRate must be positive");
  }
  if (!Number.isFinite(params.durationSeconds) || params.durationSeconds <= 0) {
    throw new Error("durationSeconds must be positive");
  }
  if (!Number.isFinite(params.points) || params.points < 2) {
    throw new Error("points must be at least 2");
  }
  if (!Number.isFinite(params.dispersion) || params.dispersion <= 0) {
    throw new Error("dispersion must be positive");
  }
  if (!Number.isFinite(params.maxAmplitude) || params.maxAmplitude <= 0) {
    throw new Error("maxAmplitude must be positive");
  }

  const sampleCount = Math.max(1, Math.floor(params.sampleRate * params.durationSeconds));
  const seed =
    params.seed !== undefined
      ? params.seed >>> 0
      : (Math.floor(Math.random() * 0xffffffff) >>> 0);
  const rand = mulberry32(seed);
  const gen = gaussianStream(rand);
  const scale = amplitudeScale(params.points, params.dispersion, params.maxAmplitude);
  const out = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) {
    out[i] = gen.next().value * scale;
  }
  return out;
}

/** Peak-normalized 16-bit export (avoids clipping long Gaussian tails). */
export function floatNoiseToInt16Pcm(samples: Float32Array): Int16Array {
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    peak = Math.max(peak, Math.abs(samples[i] ?? 0));
  }
  const pcm = new Int16Array(samples.length);
  if (peak === 0) {
    return pcm;
  }
  const gain = 32767 / peak;
  for (let i = 0; i < samples.length; i += 1) {
    const v = Math.round((samples[i] ?? 0) * gain);
    pcm[i] = Math.max(-32768, Math.min(32767, v));
  }
  return pcm;
}
