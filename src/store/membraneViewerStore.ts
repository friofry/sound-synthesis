import { create } from "zustand";
import type { FloatArray } from "../engine/types";
import type { GraphPerturbation } from "../engine/types";
import { clonePerturbation, GraphModel } from "../engine/graph";

export type ViewerSource = "editor" | "note-generated" | "tool-preview";

export type ViewerSourceState = {
  source: ViewerSource;
  graph: GraphModel;
  perturbation: GraphPerturbation;
  originSignature: string;
  revision: number;
};

type MembraneViewerStore = {
  activeSource: ViewerSource;
  snapshots: Record<string, ViewerSourceState>;
  setActiveSource: (source: ViewerSource) => void;
  initializeSource: (
    source: ViewerSource,
    graph: GraphModel,
    options?: { force?: boolean; activate?: boolean; perturbation?: GraphPerturbation },
  ) => void;
  syncRuntimeStateToActiveSnapshot: (u: FloatArray, v?: FloatArray | null) => void;
};

const EMPTY_EDITOR_SNAPSHOT: ViewerSourceState = {
  source: "editor",
  graph: new GraphModel(),
  perturbation: new GraphModel().editorPerturbation,
  originSignature: "__empty__",
  revision: 0,
};

export const useMembraneViewerStore = create<MembraneViewerStore>((set) => ({
  activeSource: "editor",
  snapshots: {
    editor: EMPTY_EDITOR_SNAPSHOT,
  },
  setActiveSource: (source) => set({ activeSource: source }),
  initializeSource: (source, graph, options) =>
    set((state) => {
      const sourceKey = sourceToKey(source);
      const activate = options?.activate ?? true;
      const nextPerturbation = clonePerturbation(options?.perturbation ?? graph.editorPerturbation);
      const nextSignature = buildGraphSnapshotSignature(graph, nextPerturbation);
      const prev = state.snapshots[sourceKey];
      if (!options?.force && prev && prev.originSignature === nextSignature) {
        if (!activate || state.activeSource === source) {
          return state;
        }
        return { ...state, activeSource: source };
      }

      const nextSnapshot: ViewerSourceState = {
        source,
        graph: graph.clone(),
        perturbation: nextPerturbation,
        originSignature: nextSignature,
        revision: (prev?.revision ?? 0) + 1,
      };
      return {
        ...state,
        activeSource: activate ? source : state.activeSource,
        snapshots:
          source === "editor"
            ? {
                ...state.snapshots,
                [sourceKey]: nextSnapshot,
              }
            : {
                // Keep viewer cache bounded: editor + active generated/tool sources.
                editor: state.snapshots.editor ?? EMPTY_EDITOR_SNAPSHOT,
                ...(state.snapshots["tool-preview"]
                  ? { "tool-preview": state.snapshots["tool-preview"] }
                  : {}),
                [sourceKey]: nextSnapshot,
              },
      };
    }),
  syncRuntimeStateToActiveSnapshot: (u, v) =>
    set((state) => {
      const sourceKey = sourceToKey(state.activeSource);
      const current = state.snapshots[sourceKey];
      if (!current) {
        return state;
      }

      const nextPerturbation = clonePerturbation(current.perturbation);
      const dotCount = Math.min(current.graph.dots.length, u.length);
      for (let i = 0; i < dotCount; i += 1) {
        const dot = current.graph.dots[i];
        if (!dot || dot.fixed) {
          continue;
        }
        nextPerturbation.points[i] = {
          u: Number.isFinite(u[i]) ? u[i] : dot.u,
          v: v && Number.isFinite(v[i]) ? v[i] : dot.v,
        };
      }

      const nextSnapshot: ViewerSourceState = {
        ...current,
        perturbation: nextPerturbation,
        revision: current.revision + 1,
      };
      return {
        ...state,
        snapshots: {
          ...state.snapshots,
          [sourceKey]: nextSnapshot,
        },
      };
    }),
}));

export function sourceToKey(source: ViewerSource): string {
  return source;
}

export function buildGraphSnapshotSignature(graph: GraphModel, perturbation: GraphPerturbation): string {
  const effectiveDots = graph.getDotsForPerturbation(perturbation);
  const dots = graph.dots
    .map((dot, index) => {
      const point = effectiveDots[index];
      return `${dot.x}:${dot.y}:${point?.u ?? 0}:${point?.v ?? 0}:${dot.weight}:${Number(dot.fixed)}`;
    })
    .join("|");
  const lines = graph.lines.map((line) => `${line.dot1}:${line.dot2}:${line.k}`).join("|");
  return `${graph.resolvePlayingPoint(perturbation)}#${dots}#${lines}`;
}
