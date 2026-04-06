import { useGraphStore } from "../../store/graphStore";
import { useViewerStore } from "../../store/viewerStore";

export function ViewerControls() {
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
      <button type="button" className="toolbar-btn utility" onClick={playing ? pause : play} disabled={!canPlay}>
        {playing ? "Pause" : "Play"}
      </button>
      <button type="button" className="toolbar-btn utility" onClick={stop} disabled={!canPlay}>
        Stop
      </button>
      <button type="button" className="toolbar-btn utility" onClick={slower}>
        Slow
      </button>
      <button type="button" className="toolbar-btn utility" onClick={faster}>
        Fast
      </button>
      <button type="button" className="toolbar-btn utility" onClick={increaseAmplitude}>
        Amp+
      </button>
      <button type="button" className="toolbar-btn utility" onClick={decreaseAmplitude}>
        Amp-
      </button>
      <span className="viewer-meta">Speed: {speed}x</span>
      <span className="viewer-meta">Amp: {amplitudeScale.toFixed(1)}</span>
      <span className="viewer-meta">
        Frame: {frameLabel}
      </span>
    </div>
  );
}
