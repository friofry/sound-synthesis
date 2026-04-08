import { create } from "zustand";
import type {
  RawInstrumentNote,
  SimMethod,
  SerializedGraph,
  SimulationBackend,
  SimulationPrecision,
  SimulationSubstepsMode,
} from "../engine/types";
import {
  DEFAULT_SIMULATION_METHOD,
  DEFAULT_SIMULATION_PRECISION,
  DEFAULT_SIMULATION_SUBSTEPS,
  DEFAULT_SIMULATION_SUBSTEPS_MODE,
  resolveDefaultSimulationBackend,
} from "../engine/simulationDefaults";

export const VIEWER_BASE_GRAPH_SNAPSHOT_IDS = {
  instrument: "instrument:latest",
  singleNote: "single-note:latest",
} as const;

export type PianoGenerateSettings = {
  octaves: 1 | 2 | 3;
  attenuation: number;
  squareAttenuation: number;
  durationMs: number;
  tillSilence: boolean;
  sampleRate: 8000 | 22050 | 44100;
  method: SimMethod;
  backend: SimulationBackend;
  precision: SimulationPrecision;
  substepsMode: SimulationSubstepsMode;
  substeps: number;
};

type PianoStore = {
  noteCount: number;
  pressedKeys: Set<number>;
  lastPressedKeyIndex: number | null;
  viewerBaseGraphSnapshots: Record<string, SerializedGraph>;
  activeBuffer: Float32Array | null;
  activeSampleRate: number;
  instrumentNotes: RawInstrumentNote[];
  generateNotesDialogOpen: boolean;
  generateNotesSettings: PianoGenerateSettings;
  isGeneratingInstrument: boolean;
  generationProgressDialogOpen: boolean;
  instrumentGenerationProgress: number;
  instrumentGenerationLabel: string;
  recording: boolean;
  lastSncText: string;
  lastRenderedWav: Blob | null;
  pressKey: (index: number) => void;
  releaseKey: (index: number) => void;
  releaseAll: () => void;
  setActiveBuffer: (buffer: Float32Array | null, sampleRate?: number) => void;
  setInstrumentNotes: (notes: RawInstrumentNote[]) => void;
  setViewerBaseGraphSnapshots: (snapshots: Record<string, SerializedGraph>) => void;
  setViewerBaseGraphSnapshot: (snapshotId: string, graph: SerializedGraph) => void;
  setGenerateNotesDialogOpen: (open: boolean) => void;
  setGenerateNotesSettings: (settings: PianoGenerateSettings) => void;
  setInstrumentGenerationState: (values: {
    isGeneratingInstrument?: boolean;
    generationProgressDialogOpen?: boolean;
    instrumentGenerationProgress?: number;
    instrumentGenerationLabel?: string;
  }) => void;
  setRecording: (recording: boolean) => void;
  setLastSncText: (text: string) => void;
  setLastRenderedWav: (blob: Blob | null) => void;
};

export const usePianoStore = create<PianoStore>((set) => ({
  noteCount: 24,
  pressedKeys: new Set<number>(),
  lastPressedKeyIndex: null,
  viewerBaseGraphSnapshots: {},
  activeBuffer: null,
  activeSampleRate: 48_000,
  instrumentNotes: [],
  generateNotesDialogOpen: false,
  generateNotesSettings: {
    octaves: 2,
    attenuation: 4,
    squareAttenuation: 0.08,
    durationMs: 150,
    tillSilence: false,
    sampleRate: 44100,
    method: DEFAULT_SIMULATION_METHOD,
    backend: resolveDefaultSimulationBackend(DEFAULT_SIMULATION_METHOD, DEFAULT_SIMULATION_PRECISION),
    precision: DEFAULT_SIMULATION_PRECISION,
    substepsMode: DEFAULT_SIMULATION_SUBSTEPS_MODE,
    substeps: DEFAULT_SIMULATION_SUBSTEPS,
  },
  isGeneratingInstrument: false,
  generationProgressDialogOpen: false,
  instrumentGenerationProgress: 0,
  instrumentGenerationLabel: "",
  recording: false,
  lastSncText: "",
  lastRenderedWav: null,
  pressKey: (index) =>
    set((state) => {
      if (state.pressedKeys.has(index)) {
        return state;
      }
      const next = new Set(state.pressedKeys);
      next.add(index);
      return { pressedKeys: next, lastPressedKeyIndex: index };
    }),
  releaseKey: (index) =>
    set((state) => {
      if (!state.pressedKeys.has(index)) {
        return state;
      }
      const next = new Set(state.pressedKeys);
      next.delete(index);
      return { pressedKeys: next };
    }),
  releaseAll: () => set({ pressedKeys: new Set<number>() }),
  setActiveBuffer: (buffer, sampleRate = 48_000) =>
    set({
      activeBuffer: buffer,
      activeSampleRate: sampleRate,
    }),
  setInstrumentNotes: (notes) =>
    set({
      instrumentNotes: notes,
      noteCount: notes.length || 24,
      activeBuffer: notes[0]?.buffer ?? null,
      activeSampleRate: notes[0]?.sampleRate ?? 48_000,
    }),
  setViewerBaseGraphSnapshots: (snapshots) => set({ viewerBaseGraphSnapshots: { ...snapshots } }),
  setViewerBaseGraphSnapshot: (snapshotId, graph) =>
    set((state) => {
      const current = state.viewerBaseGraphSnapshots;
      if (snapshotId === VIEWER_BASE_GRAPH_SNAPSHOT_IDS.instrument) {
        return {
          viewerBaseGraphSnapshots: {
            [VIEWER_BASE_GRAPH_SNAPSHOT_IDS.instrument]: graph,
            ...(current[VIEWER_BASE_GRAPH_SNAPSHOT_IDS.singleNote]
              ? { [VIEWER_BASE_GRAPH_SNAPSHOT_IDS.singleNote]: current[VIEWER_BASE_GRAPH_SNAPSHOT_IDS.singleNote] }
              : {}),
          },
        };
      }
      if (snapshotId === VIEWER_BASE_GRAPH_SNAPSHOT_IDS.singleNote) {
        return {
          viewerBaseGraphSnapshots: {
            ...(current[VIEWER_BASE_GRAPH_SNAPSHOT_IDS.instrument]
              ? { [VIEWER_BASE_GRAPH_SNAPSHOT_IDS.instrument]: current[VIEWER_BASE_GRAPH_SNAPSHOT_IDS.instrument] }
              : {}),
            [VIEWER_BASE_GRAPH_SNAPSHOT_IDS.singleNote]: graph,
          },
        };
      }
      return {
        viewerBaseGraphSnapshots: {
          ...current,
          [snapshotId]: graph,
        },
      };
    }),
  setGenerateNotesDialogOpen: (open) => set({ generateNotesDialogOpen: open }),
  setGenerateNotesSettings: (settings) => set({ generateNotesSettings: settings }),
  setInstrumentGenerationState: (values) =>
    set((state) => ({
      isGeneratingInstrument: values.isGeneratingInstrument ?? state.isGeneratingInstrument,
      generationProgressDialogOpen: values.generationProgressDialogOpen ?? state.generationProgressDialogOpen,
      instrumentGenerationProgress: values.instrumentGenerationProgress ?? state.instrumentGenerationProgress,
      instrumentGenerationLabel: values.instrumentGenerationLabel ?? state.instrumentGenerationLabel,
    })),
  setRecording: (recording) => set({ recording }),
  setLastSncText: (text) => set({ lastSncText: text }),
  setLastRenderedWav: (blob) => set({ lastRenderedWav: blob }),
}));
