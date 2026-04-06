import { create } from "zustand";
import type { RawInstrumentNote, SimMethod } from "../engine/types";

export type PianoGenerateSettings = {
  octaves: 1 | 2 | 3;
  attenuation: number;
  squareAttenuation: number;
  durationMs: number;
  tillSilence: boolean;
  sampleRate: 8000 | 22050 | 44100;
  method: SimMethod;
};

type PianoStore = {
  noteCount: number;
  pressedKeys: Set<number>;
  activeBuffer: Float32Array | null;
  activeSampleRate: number;
  instrumentNotes: RawInstrumentNote[];
  generateNotesDialogOpen: boolean;
  generateNotesSettings: PianoGenerateSettings;
  isGeneratingInstrument: boolean;
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
  setGenerateNotesDialogOpen: (open: boolean) => void;
  setGenerateNotesSettings: (settings: PianoGenerateSettings) => void;
  setInstrumentGenerationState: (values: {
    isGeneratingInstrument?: boolean;
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
    method: "euler",
  },
  isGeneratingInstrument: false,
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
      return { pressedKeys: next };
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
  setGenerateNotesDialogOpen: (open) => set({ generateNotesDialogOpen: open }),
  setGenerateNotesSettings: (settings) => set({ generateNotesSettings: settings }),
  setInstrumentGenerationState: (values) =>
    set((state) => ({
      isGeneratingInstrument: values.isGeneratingInstrument ?? state.isGeneratingInstrument,
      instrumentGenerationProgress: values.instrumentGenerationProgress ?? state.instrumentGenerationProgress,
      instrumentGenerationLabel: values.instrumentGenerationLabel ?? state.instrumentGenerationLabel,
    })),
  setRecording: (recording) => set({ recording }),
  setLastSncText: (text) => set({ lastSncText: text }),
  setLastRenderedWav: (blob) => set({ lastRenderedWav: blob }),
}));
