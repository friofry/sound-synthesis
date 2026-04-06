import type {
  GraphData,
  KoeffStr,
  SimulationParams,
  SimulationResult,
  SimulationState,
} from "./types";

const DEFAULT_EDGE_FADE_MS = 2;

export function createConnectionStructure(graph: GraphData): KoeffStr[] {
  const coeffs: KoeffStr[] = [];

  const addCoeff = (i: number, j: number, value: number) => {
    if (value !== 0) {
      coeffs.push({ i, j, value });
    }
  };

  for (const line of graph.lines) {
    const d1 = graph.dots[line.dot1];
    const d2 = graph.dots[line.dot2];
    if (!d1 || !d2) {
      continue;
    }

    if (!d1.fixed && !d2.fixed) {
      addCoeff(line.dot1, line.dot1, -line.k / d1.weight);
      addCoeff(line.dot1, line.dot2, line.k / d1.weight);
      addCoeff(line.dot2, line.dot2, -line.k / d2.weight);
      addCoeff(line.dot2, line.dot1, line.k / d2.weight);
      continue;
    }

    if (!d1.fixed) {
      addCoeff(line.dot1, line.dot1, -line.k / d1.weight);
    }
    if (!d2.fixed) {
      addCoeff(line.dot2, line.dot2, -line.k / d2.weight);
    }
  }

  return coeffs;
}

export function multiplySparse(n: number, vector: Float64Array, coeffs: KoeffStr[]): Float64Array {
  const result = new Float64Array(n);
  for (const coeff of coeffs) {
    result[coeff.i] += coeff.value * vector[coeff.j];
  }
  return result;
}

export function sqrAnnuation(acceleration: Float64Array, velocity: Float64Array, squareAttenuation: number): void {
  for (let i = 0; i < velocity.length; i += 1) {
    acceleration[i] -= squareAttenuation * Math.abs(velocity[i]) * velocity[i];
  }
}

export function eulerCramerStep(
  state: SimulationState,
  coeffs: KoeffStr[],
  dt: number,
  attenuation: number,
  squareAttenuation = 0,
): void {
  const { u, v } = state;
  const spring = multiplySparse(u.length, u, coeffs);

  for (let i = 0; i < u.length; i += 1) {
    spring[i] -= attenuation * v[i];
  }
  sqrAnnuation(spring, v, squareAttenuation);

  for (let i = 0; i < u.length; i += 1) {
    v[i] += spring[i] * dt;
    u[i] += v[i] * dt;
  }
}

export function rungeKuttaStep(
  state: SimulationState,
  coeffs: KoeffStr[],
  dt: number,
  attenuation: number,
  squareAttenuation = 0,
): void {
  const n = state.u.length;
  const k1u = new Float64Array(n);
  const k1v = buildAcceleration(state.u, state.v, coeffs, attenuation, squareAttenuation);

  for (let i = 0; i < n; i += 1) {
    k1u[i] = state.v[i];
  }

  const u2 = new Float64Array(n);
  const v2 = new Float64Array(n);
  const u3 = new Float64Array(n);
  const v3 = new Float64Array(n);
  const u4 = new Float64Array(n);
  const v4 = new Float64Array(n);

  for (let i = 0; i < n; i += 1) {
    u2[i] = state.u[i] + (k1u[i] * dt) / 2;
    v2[i] = state.v[i] + (k1v[i] * dt) / 2;
  }
  const k2u = v2;
  const k2v = buildAcceleration(u2, v2, coeffs, attenuation, squareAttenuation);

  for (let i = 0; i < n; i += 1) {
    u3[i] = state.u[i] + (k2u[i] * dt) / 2;
    v3[i] = state.v[i] + (k2v[i] * dt) / 2;
  }
  const k3u = v3;
  const k3v = buildAcceleration(u3, v3, coeffs, attenuation, squareAttenuation);

  for (let i = 0; i < n; i += 1) {
    u4[i] = state.u[i] + k3u[i] * dt;
    v4[i] = state.v[i] + k3v[i] * dt;
  }
  const k4u = v4;
  const k4v = buildAcceleration(u4, v4, coeffs, attenuation, squareAttenuation);

  for (let i = 0; i < n; i += 1) {
    state.u[i] += (dt / 6) * (k1u[i] + 2 * k2u[i] + 2 * k3u[i] + k4u[i]);
    state.v[i] += (dt / 6) * (k1v[i] + 2 * k2v[i] + 2 * k3v[i] + k4v[i]);
  }
}

function buildAcceleration(
  u: Float64Array,
  v: Float64Array,
  coeffs: KoeffStr[],
  attenuation: number,
  squareAttenuation: number,
): Float64Array {
  const acceleration = multiplySparse(u.length, u, coeffs);
  for (let i = 0; i < u.length; i += 1) {
    acceleration[i] -= attenuation * v[i];
  }
  sqrAnnuation(acceleration, v, squareAttenuation);
  return acceleration;
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

export function runSimulation(
  graph: GraphData,
  params: SimulationParams,
  onProgress?: (completed: number, total: number) => void,
): SimulationResult {
  const totalDots = graph.dots.length;
  const totalSamples = params.lengthK * 1024;
  const dt = 1 / params.sampleRate;
  const coeffs = createConnectionStructure(graph);
  const state: SimulationState = {
    u: new Float64Array(totalDots),
    v: new Float64Array(totalDots),
  };

  for (let i = 0; i < totalDots; i += 1) {
    const dot = graph.dots[i];
    state.u[i] = dot.fixed ? 0 : dot.u;
    state.v[i] = dot.fixed ? 0 : dot.v;
  }

  const frames: Float64Array[] = new Array(totalSamples);
  const allPointBuffers = Array.from({ length: totalDots }, () => new Float32Array(totalSamples));
  const playingPointBuffer = new Float32Array(totalSamples);
  const playingPoint = Math.max(0, Math.min(totalDots - 1, graph.playingPoint ?? params.playingPoint));

  for (let sample = 0; sample < totalSamples; sample += 1) {
    if (params.method === "runge-kutta") {
      rungeKuttaStep(state, coeffs, dt, params.attenuation, params.squareAttenuation);
    } else {
      eulerCramerStep(state, coeffs, dt, params.attenuation, params.squareAttenuation);
    }

    for (let i = 0; i < totalDots; i += 1) {
      if (graph.dots[i].fixed) {
        state.u[i] = 0;
        state.v[i] = 0;
      }
      allPointBuffers[i][sample] = state.u[i];
    }

    const frame = new Float64Array(totalDots);
    frame.set(state.u);
    frames[sample] = frame;
    playingPointBuffer[sample] = state.u[playingPoint] ?? 0;

    if (onProgress && (sample % 128 === 0 || sample === totalSamples - 1)) {
      onProgress(sample + 1, totalSamples);
    }
  }

  applyStartFadeIn(playingPointBuffer, params.sampleRate);
  applyEndFadeOut(playingPointBuffer, params.sampleRate);

  return { frames, playingPointBuffer, allPointBuffers };
}
