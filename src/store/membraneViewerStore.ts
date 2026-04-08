import { create } from "zustand";
import type { FloatArray } from "../engine/types";
import { GraphModel } from "../engine/graph";

export type ViewerSource = "editor" | "note-generated";

export type ViewerSnapshot = {
  source: ViewerSource;
  graph: GraphModel;
  originSignature: string;
  revision: number;
};

type MembraneViewerStore = {
  activeSource: ViewerSource;
  snapshots: Record<string, ViewerSnapshot>;
  setActiveSource: (source: ViewerSource) => void;
  initializeSource: (
    source: ViewerSource,
    graph: GraphModel,
    options?: { force?: boolean; activate?: boolean },
  ) => void;
  updateActiveSnapshotGraph: (updater: (graph: GraphModel) => void) => void;
  syncRuntimeStateToActiveSnapshot: (u: FloatArray, v?: FloatArray | null) => void;
};

const EMPTY_EDITOR_SNAPSHOT: ViewerSnapshot = {
  source: "editor",
  graph: new GraphModel(),
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
      const nextSignature = buildGraphSnapshotSignature(graph);
      const prev = state.snapshots[sourceKey];
      if (!options?.force && prev && prev.originSignature === nextSignature) {
        if (!activate || state.activeSource === source) {
          return state;
        }
        return { ...state, activeSource: source };
      }

      const nextSnapshot: ViewerSnapshot = {
        source,
        graph: graph.clone(),
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
                // Keep viewer cache bounded: editor + one generated-note snapshot.
                editor: state.snapshots.editor ?? EMPTY_EDITOR_SNAPSHOT,
                [sourceKey]: nextSnapshot,
              },
      };
    }),
  updateActiveSnapshotGraph: (updater) =>
    set((state) => {
      const sourceKey = sourceToKey(state.activeSource);
      const current = state.snapshots[sourceKey] ?? {
        source: state.activeSource,
        graph: new GraphModel(),
        originSignature: "__empty__",
        revision: 0,
      };
      const nextGraph = current.graph.clone();
      updater(nextGraph);

      const nextSnapshot: ViewerSnapshot = {
        ...current,
        graph: nextGraph,
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
  syncRuntimeStateToActiveSnapshot: (u, v) =>
    set((state) => {
      const sourceKey = sourceToKey(state.activeSource);
      const current = state.snapshots[sourceKey];
      if (!current) {
        return state;
      }

      const nextGraph = current.graph.clone();
      const dotCount = Math.min(nextGraph.dots.length, u.length);
      for (let i = 0; i < dotCount; i += 1) {
        const dot = nextGraph.dots[i];
        if (!dot || dot.fixed) {
          continue;
        }
        nextGraph.setDotProps(i, {
          u: Number.isFinite(u[i]) ? u[i] : dot.u,
          v: v && Number.isFinite(v[i]) ? v[i] : dot.v,
        });
      }

      const nextSnapshot: ViewerSnapshot = {
        ...current,
        graph: nextGraph,
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

export function buildGraphSnapshotSignature(graph: GraphModel): string {
  const dots = graph.dots
    .map((dot) => `${dot.x}:${dot.y}:${dot.u}:${dot.v}:${dot.weight}:${Number(dot.fixed)}`)
    .join("|");
  const lines = graph.lines.map((line) => `${line.dot1}:${line.dot2}:${line.k}`).join("|");
  return `${graph.playingPoint ?? -1}#${dots}#${lines}`;
}
