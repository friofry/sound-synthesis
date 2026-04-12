import { create } from "zustand";
import { APP_DEFAULTS, DEFAULT_CREATE_PIANO_SETTINGS } from "../config/defaults";
import type {
  RawInstrumentNote,
  SimMethod,
  SerializedGraph,
  SimulationBackend,
  SimulationPrecision,
  SimulationSubstepsMode,
} from "../engine/types";

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
  /** Order keys were pressed (each index at most once); used for "last held" after releases. */
  pressOrder: number[];
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
  /** How `buildSncPlaybackIntervals` should treat overlapping sustains for the current melody (keyboard sim + MIDI export). */
  lastSncMonophonicLead: boolean;
  lastRenderedWav: Blob | null;
  communitySncDialogOpen: boolean;
  communityMidiDialogOpen: boolean;
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
  setLastSncMonophonicLead: (value: boolean) => void;
  setLastRenderedWav: (blob: Blob | null) => void;
  openCommunitySncDialog: () => void;
  closeCommunitySncDialog: () => void;
  openCommunityMidiDialog: () => void;
  closeCommunityMidiDialog: () => void;
};

export const usePianoStore = create<PianoStore>((set) => ({
  noteCount: APP_DEFAULTS.piano.noteCount,
  pressedKeys: new Set<number>(),
  pressOrder: [],
  lastPressedKeyIndex: null,
  viewerBaseGraphSnapshots: {},
  activeBuffer: null,
  activeSampleRate: APP_DEFAULTS.piano.activeSampleRate,
  instrumentNotes: [],
  generateNotesDialogOpen: false,
  generateNotesSettings: { ...DEFAULT_CREATE_PIANO_SETTINGS },
  isGeneratingInstrument: false,
  generationProgressDialogOpen: false,
  instrumentGenerationProgress: 0,
  instrumentGenerationLabel: "",
  recording: false,
  lastSncText: "",
  lastSncMonophonicLead: true,
  lastRenderedWav: null,
  communitySncDialogOpen: false,
  communityMidiDialogOpen: false,
  pressKey: (index) =>
    set((state) => {
      if (state.pressedKeys.has(index)) {
        return state;
      }
      const next = new Set(state.pressedKeys);
      next.add(index);
      const pressOrder = [...state.pressOrder, index];
      return { pressedKeys: next, pressOrder, lastPressedKeyIndex: index };
    }),
  releaseKey: (index) =>
    set((state) => {
      if (!state.pressedKeys.has(index)) {
        return state;
      }
      const next = new Set(state.pressedKeys);
      next.delete(index);
      const pressOrder = [...state.pressOrder];
      const pos = pressOrder.lastIndexOf(index);
      if (pos >= 0) {
        pressOrder.splice(pos, 1);
      }
      const lastPressedKeyIndex = pressOrder.at(-1) ?? null;
      return { pressedKeys: next, pressOrder, lastPressedKeyIndex };
    }),
  releaseAll: () => set({ pressedKeys: new Set<number>(), pressOrder: [], lastPressedKeyIndex: null }),
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
  setLastSncMonophonicLead: (value) => set({ lastSncMonophonicLead: value }),
  setLastRenderedWav: (blob) => set({ lastRenderedWav: blob }),
  openCommunitySncDialog: () => set({ communitySncDialogOpen: true }),
  closeCommunitySncDialog: () => set({ communitySncDialogOpen: false }),
  openCommunityMidiDialog: () => set({ communityMidiDialogOpen: true }),
  closeCommunityMidiDialog: () => set({ communityMidiDialogOpen: false }),
}));
