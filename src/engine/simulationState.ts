import type { GraphData, SimulationState } from "./types";

export function collectFixedIndices(graph: GraphData): number[] {
  const fixed: number[] = [];
  for (let i = 0; i < graph.dots.length; i += 1) {
    if (graph.dots[i].fixed) {
      fixed.push(i);
    }
  }
  return fixed;
}

export function initializeStateFromGraph(graph: GraphData): SimulationState {
  const state: SimulationState = {
    u: new Float64Array(graph.dots.length),
    v: new Float64Array(graph.dots.length),
  };
  for (let i = 0; i < graph.dots.length; i += 1) {
    const dot = graph.dots[i];
    state.u[i] = dot.fixed ? 0 : dot.u;
    state.v[i] = dot.fixed ? 0 : dot.v;
  }
  return state;
}

export function clampFixedNodes(state: SimulationState, fixedIndices: readonly number[]): void {
  for (const index of fixedIndices) {
    state.u[index] = 0;
    state.v[index] = 0;
  }
}
