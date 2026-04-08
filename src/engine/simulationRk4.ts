import type { FloatArray, SimulationState } from "./types";

export type RungeKuttaWorkspace<TArr extends FloatArray = Float64Array> = {
  k1u: TArr;
  k1v: TArr;
  u2: TArr;
  v2: TArr;
  u3: TArr;
  v3: TArr;
  u4: TArr;
  v4: TArr;
  k2v: TArr;
  k3v: TArr;
  k4v: TArr;
};

export function createRungeKuttaWorkspace(
  n: number,
  factory: (length: number) => FloatArray = (length) => new Float64Array(length),
): RungeKuttaWorkspace<FloatArray> {
  return {
    k1u: factory(n),
    k1v: factory(n),
    u2: factory(n),
    v2: factory(n),
    u3: factory(n),
    v3: factory(n),
    u4: factory(n),
    v4: factory(n),
    k2v: factory(n),
    k3v: factory(n),
    k4v: factory(n),
  };
}

export function rungeKuttaStepShared(
  state: SimulationState,
  dt: number,
  workspace: RungeKuttaWorkspace<FloatArray>,
  buildAcceleration: (u: FloatArray, v: FloatArray, out: FloatArray) => void,
): void {
  const n = state.u.length;
  const { k1u, k1v, u2, v2, u3, v3, u4, v4, k2v, k3v, k4v } = workspace;
  buildAcceleration(state.u, state.v, k1v);

  for (let i = 0; i < n; i += 1) {
    k1u[i] = state.v[i];
  }

  for (let i = 0; i < n; i += 1) {
    u2[i] = state.u[i] + (k1u[i] * dt) / 2;
    v2[i] = state.v[i] + (k1v[i] * dt) / 2;
  }
  const k2u = v2;
  buildAcceleration(u2, v2, k2v);

  for (let i = 0; i < n; i += 1) {
    u3[i] = state.u[i] + (k2u[i] * dt) / 2;
    v3[i] = state.v[i] + (k2v[i] * dt) / 2;
  }
  const k3u = v3;
  buildAcceleration(u3, v3, k3v);

  for (let i = 0; i < n; i += 1) {
    u4[i] = state.u[i] + k3u[i] * dt;
    v4[i] = state.v[i] + k3v[i] * dt;
  }
  const k4u = v4;
  buildAcceleration(u4, v4, k4v);

  for (let i = 0; i < n; i += 1) {
    state.u[i] += (dt / 6) * (k1u[i] + 2 * k2u[i] + 2 * k3u[i] + k4u[i]);
    state.v[i] += (dt / 6) * (k1v[i] + 2 * k2v[i] + 2 * k3v[i] + k4v[i]);
  }
}
