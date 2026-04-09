import { getMembraneRuntimeStepper } from "../components/Viewer3D/liveRuntimeBridge";
import { useGraphStore } from "../store/graphStore";
import { useMembraneViewerStore } from "../store/membraneViewerStore";
import { usePianoStore } from "../store/pianoStore";
import { useViewerStore } from "../store/viewerStore";

type HammerImpactSnapshot = {
  impactX: number;
  impactY: number;
  charge: number;
  radius: number;
};

type HammerPreviewSnapshot = {
  buffer: Float32Array | null;
  sampleRate: number | null;
  sequence: number;
};

type DotSnapshot = {
  x: number;
  y: number;
  u: number;
  v: number;
  fixed: boolean;
  weight: number;
};

type E2EHarness = {
  clearHammerPreview: () => void;
  setLastHammerImpact: (impact: HammerImpactSnapshot) => void;
  recordHammerPreview: (buffer: Float32Array, sampleRate: number) => void;
  getHammerPreviewMetrics: () => {
    available: boolean;
    sequence: number;
    sampleRate: number | null;
    length: number;
    maxAbs: number;
    rms: number;
    nonZeroCount: number;
  };
  getLastHammerImpact: () => HammerImpactSnapshot | null;
  getEditorGraphDots: () => DotSnapshot[];
  getViewerSnapshotDots: () => DotSnapshot[];
  getViewerStatus: () => {
    activeSource: string;
    playing: boolean;
    frameIndex: number;
  };
  getViewerRuntimeState: () => {
    u: number[];
    v: number[];
  } | null;
  getPianoActiveBufferInfo: () => {
    length: number;
    sampleRate: number;
  };
};

declare global {
  interface Window {
    __e2eHarness?: E2EHarness;
  }
}

const isE2E = import.meta.env.VITE_E2E === "1" || import.meta.env.DEV;

let hammerPreview: HammerPreviewSnapshot = {
  buffer: null,
  sampleRate: null,
  sequence: 0,
};
let lastHammerImpact: HammerImpactSnapshot | null = null;

function toDotSnapshot(dots: Array<{ x: number; y: number; u: number; v: number; fixed: boolean; weight: number }>): DotSnapshot[] {
  return dots.map((dot) => ({
    x: dot.x,
    y: dot.y,
    u: dot.u,
    v: dot.v,
    fixed: dot.fixed,
    weight: dot.weight,
  }));
}

function getHammerPreviewMetrics() {
  const buffer = hammerPreview.buffer;
  if (!buffer || buffer.length === 0) {
    return {
      available: false,
      sequence: hammerPreview.sequence,
      sampleRate: hammerPreview.sampleRate,
      length: 0,
      maxAbs: 0,
      rms: 0,
      nonZeroCount: 0,
    };
  }

  let maxAbs = 0;
  let squareSum = 0;
  let nonZeroCount = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    const sample = buffer[index] ?? 0;
    const absSample = Math.abs(sample);
    if (absSample > maxAbs) {
      maxAbs = absSample;
    }
    if (absSample > 1e-8) {
      nonZeroCount += 1;
    }
    squareSum += sample * sample;
  }

  return {
    available: true,
    sequence: hammerPreview.sequence,
    sampleRate: hammerPreview.sampleRate,
    length: buffer.length,
    maxAbs,
    rms: Math.sqrt(squareSum / buffer.length),
    nonZeroCount,
  };
}

function buildHarness(): E2EHarness {
  return {
    clearHammerPreview: () => {
      hammerPreview = {
        buffer: null,
        sampleRate: null,
        sequence: hammerPreview.sequence + 1,
      };
    },
    setLastHammerImpact: (impact) => {
      lastHammerImpact = { ...impact };
    },
    recordHammerPreview: (buffer, sampleRate) => {
      hammerPreview = {
        buffer: new Float32Array(buffer),
        sampleRate,
        sequence: hammerPreview.sequence + 1,
      };
    },
    getHammerPreviewMetrics,
    getLastHammerImpact: () => (lastHammerImpact ? { ...lastHammerImpact } : null),
    getEditorGraphDots: () => {
      const graph = useGraphStore.getState().graph;
      return toDotSnapshot(graph.dots);
    },
    getViewerSnapshotDots: () => {
      const { activeSource, snapshots } = useMembraneViewerStore.getState();
      const snapshot = snapshots[activeSource];
      if (!snapshot) {
        return [];
      }
      return toDotSnapshot(snapshot.graph.dots);
    },
    getViewerStatus: () => {
      const viewer = useViewerStore.getState();
      const activeSource = useMembraneViewerStore.getState().activeSource;
      return {
        activeSource,
        playing: viewer.playing,
        frameIndex: viewer.frameIndex,
      };
    },
    getViewerRuntimeState: () => {
      const runtimeStepper = getMembraneRuntimeStepper();
      if (!runtimeStepper) {
        return null;
      }
      return {
        u: Array.from(runtimeStepper.state.u),
        v: Array.from(runtimeStepper.state.v),
      };
    },
    getPianoActiveBufferInfo: () => {
      const pianoState = usePianoStore.getState();
      return {
        length: pianoState.activeBuffer?.length ?? 0,
        sampleRate: pianoState.activeSampleRate,
      };
    },
  };
}

export function installE2EHarness(): void {
  if (!isE2E || typeof window === "undefined") {
    return;
  }
  if (window.__e2eHarness) {
    return;
  }
  window.__e2eHarness = buildHarness();
}

export function e2eRecordHammerPreview(buffer: Float32Array, sampleRate: number): void {
  if (!isE2E) {
    return;
  }
  if (window.__e2eHarness) {
    window.__e2eHarness.recordHammerPreview(buffer, sampleRate);
  }
}

export function e2eSetLastHammerImpact(payload: {
  impactX: number;
  impactY: number;
  charge: number;
  radius: number;
}): void {
  if (!isE2E) {
    return;
  }
  if (window.__e2eHarness) {
    window.__e2eHarness.setLastHammerImpact(payload);
  }
}
