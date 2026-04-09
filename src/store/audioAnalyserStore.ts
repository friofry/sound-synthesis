import { create } from "zustand";

type AudioAnalyserStore = {
  analyser: AnalyserNode | null;
  setAnalyser: (node: AnalyserNode | null) => void;
};

export const useAudioAnalyserStore = create<AudioAnalyserStore>((set) => ({
  analyser: null,
  setAnalyser: (node) => set({ analyser: node }),
}));
