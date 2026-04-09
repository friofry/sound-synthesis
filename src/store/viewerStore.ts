import { create } from "zustand";

interface ViewerStore {
  frameIndex: number;
  playing: boolean;
  speed: number;
  amplitudeScale: number;
  heatmapEnabled: boolean;
  play: () => void;
  pause: () => void;
  stop: () => void;
  faster: () => void;
  slower: () => void;
  increaseAmplitude: () => void;
  decreaseAmplitude: () => void;
  toggleHeatmap: () => void;
  resetFrame: () => void;
  advanceFrame: (frameCount: number) => void;
}

export const useViewerStore = create<ViewerStore>((set, get) => ({
  frameIndex: 0,
  playing: true,
  speed: 16,
  amplitudeScale: 1.5,
  heatmapEnabled: true,
  play: () => set({ playing: true }),
  pause: () => set({ playing: false }),
  stop: () => set({ playing: false, frameIndex: 0 }),
  faster: () => set((state) => ({ speed: state.speed * 2 })),
  slower: () => set((state) => ({ speed: Math.max(1, Math.floor(state.speed / 2)) })),
  increaseAmplitude: () => set((state) => ({ amplitudeScale: Math.min(8, state.amplitudeScale + 0.5) })),
  decreaseAmplitude: () => set((state) => ({ amplitudeScale: Math.max(0.5, state.amplitudeScale - 0.5) })),
  toggleHeatmap: () => set((state) => ({ heatmapEnabled: !state.heatmapEnabled })),
  resetFrame: () => set({ frameIndex: 0 }),
  advanceFrame: (frameCount) => {
    const { playing, frameIndex, speed } = get();
    if (!playing) {
      return;
    }
    if (frameCount <= 0) {
      set({ frameIndex: frameIndex + speed });
      return;
    }
    const next = frameIndex + speed;
    if (next >= frameCount) {
      set({ frameIndex: 0, playing: false });
      return;
    }
    set({ frameIndex: next });
  },
}));
