import type { CSSProperties } from "react";
import { useGraphStore } from "../../store/graphStore";
import { useViewerStore } from "../../store/viewerStore";

export function ViewerToolbar() {
  const simulationResult = useGraphStore((state) => state.simulationResult);
  const graph = useGraphStore((state) => state.graph);
  const playing = useViewerStore((state) => state.playing);
  const speed = useViewerStore((state) => state.speed);
  const amplitudeScale = useViewerStore((state) => state.amplitudeScale);
  const frameIndex = useViewerStore((state) => state.frameIndex);
  const play = useViewerStore((state) => state.play);
  const pause = useViewerStore((state) => state.pause);
  const stop = useViewerStore((state) => state.stop);
  const faster = useViewerStore((state) => state.faster);
  const slower = useViewerStore((state) => state.slower);
  const increaseAmplitude = useViewerStore((state) => state.increaseAmplitude);
  const decreaseAmplitude = useViewerStore((state) => state.decreaseAmplitude);

  const frameCount = simulationResult?.frames.length ?? 0;
  const canPlay = graph.dots.length > 0 && graph.lines.length > 0;
  const frameLabel = frameCount > 0 ? `${frameIndex}/${Math.max(0, frameCount - 1)}` : `${frameIndex}/live`;

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
        onClick={stop}
        disabled={!canPlay}
        title="Stop"
      >
        <span className="toolbar-sprite viewer-toolbar-sprite" style={{ "--sprite-index": 1 } as CSSProperties} aria-hidden />
        <span className="sr-only">Stop</span>
      </button>
      <button type="button" className="viewer-btn viewer-icon-btn" onClick={slower} title="Slower">
        <span className="toolbar-sprite viewer-toolbar-sprite" style={{ "--sprite-index": 2 } as CSSProperties} aria-hidden />
        <span className="sr-only">Slower</span>
      </button>
      <button type="button" className="viewer-btn viewer-icon-btn" onClick={faster} title="Faster">
        <span className="toolbar-sprite viewer-toolbar-sprite" style={{ "--sprite-index": 3 } as CSSProperties} aria-hidden />
        <span className="sr-only">Faster</span>
      </button>
      <button
        type="button"
        className="viewer-btn viewer-icon-btn"
        onClick={increaseAmplitude}
        title="Increase amplitude"
      >
        <span className="toolbar-sprite viewer-toolbar-sprite" style={{ "--sprite-index": 4 } as CSSProperties} aria-hidden />
        <span className="sr-only">Increase amplitude</span>
      </button>
      <button
        type="button"
        className="viewer-btn viewer-icon-btn"
        onClick={decreaseAmplitude}
        title="Decrease amplitude"
      >
        <span className="toolbar-sprite viewer-toolbar-sprite" style={{ "--sprite-index": 5 } as CSSProperties} aria-hidden />
        <span className="sr-only">Decrease amplitude</span>
      </button>
      <span className="viewer-meta">Speed: {speed}x</span>
      <span className="viewer-meta">Amp: {amplitudeScale.toFixed(1)}</span>
      <span className="viewer-meta">Frame: {frameLabel}</span>
    </div>
  );
}
