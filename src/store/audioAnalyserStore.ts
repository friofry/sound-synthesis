import { create } from "zustand";

type AudioAnalyserStore = {
  analyser: AnalyserNode | null;
  setAnalyser: (node: AnalyserNode | null, source: string) => void;
  _source: string | null;
};

export const useAudioAnalyserStore = create<AudioAnalyserStore>((set, get) => ({
  analyser: null,
  _source: null,
  setAnalyser: (node, source) => {
    if (node === null) {
      if (get()._source === source) {
        set({ analyser: null, _source: null });
      }
      return;
    }
    set({ analyser: node, _source: source });
  },
}));
