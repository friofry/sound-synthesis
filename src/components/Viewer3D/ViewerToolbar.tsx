import type { CSSProperties } from "react";
import { useGraphStore } from "../../store/graphStore";
import { useMembraneViewerStore } from "../../store/membraneViewerStore";
import { useViewerStore } from "../../store/viewerStore";

export function ViewerToolbar() {
  const editorGraph = useGraphStore((state) => state.graph);
  const activeSnapshot = useMembraneViewerStore((state) => state.snapshots[state.activeSource]);
  const initializeSource = useMembraneViewerStore((state) => state.initializeSource);
  const playing = useViewerStore((state) => state.playing);
  const speed = useViewerStore((state) => state.speed);
  const amplitudeScale = useViewerStore((state) => state.amplitudeScale);
  const heatmapEnabled = useViewerStore((state) => state.heatmapEnabled);
  const frameIndex = useViewerStore((state) => state.frameIndex);
  const play = useViewerStore((state) => state.play);
  const pause = useViewerStore((state) => state.pause);
  const resetFrame = useViewerStore((state) => state.resetFrame);
  const faster = useViewerStore((state) => state.faster);
  const slower = useViewerStore((state) => state.slower);
  const increaseAmplitude = useViewerStore((state) => state.increaseAmplitude);
  const decreaseAmplitude = useViewerStore((state) => state.decreaseAmplitude);
  const toggleHeatmap = useViewerStore((state) => state.toggleHeatmap);

  const canPlay = Boolean(activeSnapshot && activeSnapshot.graph.dots.length > 0 && activeSnapshot.graph.lines.length > 0);
  const frameLabel = `${frameIndex}/live-sim`;
  const resetToEditorSampleZero = () => {
    resetFrame();
    initializeSource("editor", editorGraph, { force: true, activate: true });
  };

  return (
    <div className="viewer-toolbar">
      <button
        type="button"
        className="viewer-btn viewer-icon-btn"
        onClick={playing ? pause : play}
        disabled={!canPlay}
        title={playing ? "Pause" : "Play"}
      >
        <span className="toolbar-sprite viewer-toolbar-sprite" style={{ "--sprite-index": 0 } as CSSProperties} aria-hidden />
        <span className="sr-only">{playing ? "Pause" : "Play"}</span>
      </button>
      <button
        type="button"
        className="viewer-btn viewer-icon-btn"
        onClick={slower}
        title="Slower"
      >
        <span className="toolbar-sprite viewer-toolbar-sprite" style={{ "--sprite-index": 1 } as CSSProperties} aria-hidden />
        <span className="sr-only">Slower</span>
      </button>
      <button type="button" className="viewer-btn viewer-icon-btn" onClick={faster} title="Faster">
        <span className="toolbar-sprite viewer-toolbar-sprite" style={{ "--sprite-index": 2 } as CSSProperties} aria-hidden />
        <span className="sr-only">Faster</span>
      </button>
      <button
        type="button"
        className="viewer-btn viewer-icon-btn"
        onClick={increaseAmplitude}
        title="Increase amplitude"
      >
        <span className="toolbar-sprite viewer-toolbar-sprite" style={{ "--sprite-index": 3 } as CSSProperties} aria-hidden />
        <span className="sr-only">Increase amplitude</span>
      </button>
      <button
        type="button"
        className="viewer-btn viewer-icon-btn"
        onClick={decreaseAmplitude}
        title="Decrease amplitude"
      >
        <span className="toolbar-sprite viewer-toolbar-sprite" style={{ "--sprite-index": 4 } as CSSProperties} aria-hidden />
        <span className="sr-only">Decrease amplitude</span>
      </button>
      <button
        type="button"
        className="viewer-btn viewer-icon-btn"
        onClick={resetToEditorSampleZero}
        disabled={!canPlay}
        title="Restart and stop"
      >
        <span className="toolbar-sprite viewer-toolbar-sprite" style={{ "--sprite-index": 5 } as CSSProperties} aria-hidden />
        <span className="sr-only">Restart and stop</span>
      </button>
      <button
        type="button"
        className="viewer-btn"
        onClick={toggleHeatmap}
        title={heatmapEnabled ? "Disable heatmap coloring" : "Enable heatmap coloring"}
        aria-pressed={heatmapEnabled}
      >
        <span aria-hidden>🎨</span>
        <span className="sr-only">Toggle heatmap coloring</span>
      </button>
      <span className="viewer-meta">Speed: {speed}x</span>
      <span className="viewer-meta">Amp: {amplitudeScale.toFixed(1)}</span>
      <span className="viewer-meta">Frame: {frameLabel}</span>
    </div>
  );
}
