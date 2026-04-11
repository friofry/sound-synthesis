import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { FrequencyBarsView } from "../components/FrequencyAnalyzer/FrequencyBarsView";
import { SpectrogramView } from "../components/FrequencyAnalyzer/SpectrogramView";
import { WaveformView } from "../components/FrequencyAnalyzer/WaveformView";
import { largestPowerOfTwoAtMost, MIN_FREQUENCY } from "../components/FrequencyAnalyzer/shared";
import { PianoKeyboard } from "../components/PianoPlayer/PianoKeyboard";
import { MfcSplitView } from "../components/ui/MfcSplitView";
import { reprepareAndGenerateRandom } from "../graph/reprepareAndGenerateRandom";
import { usePianoToolbar } from "../hooks/usePianoToolbar";
import { useAudioAnalyserStore } from "../store/audioAnalyserStore";
import { useGraphStore } from "../store/graphStore";
import { usePianoStore } from "../store/pianoStore";

type FrequencyAnalyzerPageProps = {
  onBack: () => void;
};

const FFT_OPTIONS = [1024, 2048, 4096, 8192, 16384];

/** Waveform / spectrogram / bars keep 1:2:1 of the remaining space; piano strip ~5%. */
const FREQUENCY_ANALYZER_SPLIT_RATIOS = [0.2375, 0.475, 0.2375, 0.05] as const;

function FrequencyPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="freq-analyzer-panel">
      <header className="freq-analyzer-panel-title">{title}</header>
      <div className="freq-analyzer-panel-body">{children}</div>
    </section>
  );
}

export function FrequencyAnalyzerPage({ onBack }: FrequencyAnalyzerPageProps) {
  const graph = useGraphStore((state) => state.graph);
  const simulationParams = useGraphStore((state) => state.simulationParams);

  const {
    noteCount,
    pressedKeys,
    audioEngine,
    handlePressKey,
    handleReleaseKey,
    handleConfirmGenerateNotes,
  } = usePianoToolbar({ graph, simulationParams });

  const handleReprepareAndGenerate = useCallback(() => {
    reprepareAndGenerateRandom(handleConfirmGenerateNotes);
  }, [handleConfirmGenerateNotes]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== " " || event.repeat || event.defaultPrevented) {
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      if (document.querySelector(".mfc-overlay")) {
        return;
      }

      event.preventDefault();
      handleReprepareAndGenerate();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [handleReprepareAndGenerate]);

  const setAnalyser = useAudioAnalyserStore((state) => state.setAnalyser);
  useEffect(() => {
    setAnalyser(audioEngine.analyser, "frequency-analyzer");
    return () => setAnalyser(null, "frequency-analyzer");
  }, [audioEngine.analyser, setAnalyser]);

  const engineAnalyser = useAudioAnalyserStore((state) => state.analyser);
  const activeBuffer = usePianoStore((state) => state.activeBuffer);
  const activeSampleRate = usePianoStore((state) => state.activeSampleRate);

  const [fftSize, setFftSize] = useState(8192);
  const [highlightFundamental, setHighlightFundamental] = useState(false);
  const [highlightOvertones, setHighlightOvertones] = useState(false);
  const [showNoteLabels, setShowNoteLabels] = useState(false);

  useEffect(() => {
    const liveEngineAnalyser = useAudioAnalyserStore.getState().analyser;
    if (liveEngineAnalyser) {
      liveEngineAnalyser.fftSize = fftSize;
    }
  }, [fftSize, engineAnalyser]);

  const selectedAnalyser = activeBuffer ? null : engineAnalyser;
  const selectedBuffer = activeBuffer;
  const selectedSampleRate = selectedBuffer
    ? activeSampleRate
    : engineAnalyser?.context.sampleRate ?? activeSampleRate;

  /** Cap FFT so STFT frame fits in the rendered buffer (fixes empty spectrogram when FFT > buffer length). */
  const effectiveFftSize = useMemo(() => {
    if (!activeBuffer) {
      return fftSize;
    }
    const cap = largestPowerOfTwoAtMost(activeBuffer.length);
    return Math.min(fftSize, Math.max(2, cap));
  }, [activeBuffer, fftSize]);

  const effectiveMaxFrequency = Math.max(MIN_FREQUENCY, selectedSampleRate / 2);

  const statusText = useMemo(() => {
    if (selectedBuffer) {
      const fftNote = effectiveFftSize !== fftSize ? ` · FFT ${effectiveFftSize} (capped)` : ` · FFT ${fftSize}`;
      return `Source: active buffer · ${selectedBuffer.length} samples · ${selectedSampleRate} Hz${fftNote}`;
    }
    if (engineAnalyser) {
      return `Source: audio engine · ${engineAnalyser.context.sampleRate} Hz · FFT ${engineAnalyser.fftSize}`;
    }
    return "No audio source";
  }, [effectiveFftSize, engineAnalyser, fftSize, selectedBuffer, selectedSampleRate]);

  return (
    <div className="freq-analyzer-page">
      <div className="freq-analyzer-toolbar">
        <button type="button" className="freq-toolbar-btn" onClick={onBack} aria-label="Back" title="Back">
          ⤵️
        </button>

        <span className="freq-toolbar-separator" />

        <label className="freq-toolbar-label">
          FFT
          <select
            className="freq-toolbar-select"
            value={fftSize}
            onChange={(event) => setFftSize(Number(event.target.value))}
          >
            {FFT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <span className="freq-toolbar-separator" />

        <button
          type="button"
          className={`freq-toolbar-btn${highlightFundamental ? " freq-toolbar-btn-active" : ""}`}
          onClick={() => setHighlightFundamental((prev) => !prev)}
          aria-pressed={highlightFundamental}
          title="Highlight dominant note and frequency"
        >
          🎼 Fundamental
        </button>
        <button
          type="button"
          className={`freq-toolbar-btn${highlightOvertones ? " freq-toolbar-btn-active" : ""}`}
          onClick={() => setHighlightOvertones((prev) => !prev)}
          aria-pressed={highlightOvertones}
          title="Highlight overtones (2×, 3×, …) with frequency"
        >
          🎵 Overtones
        </button>
        <button
          type="button"
          className={`freq-toolbar-btn${showNoteLabels ? " freq-toolbar-btn-active" : ""}`}
          onClick={() => setShowNoteLabels((prev) => !prev)}
          aria-pressed={showNoteLabels}
          title="Show note labels (E3, C4, …) instead of Hz grid"
        >
          🎹 Notes
        </button>

        <span className="freq-toolbar-status">{statusText}</span>
      </div>

      <div className="freq-analyzer-content">
        <MfcSplitView
          orientation="vertical"
          defaultRatios={[...FREQUENCY_ANALYZER_SPLIT_RATIOS]}
          minPaneSize={24}
          className="freq-analyzer-split-view"
        >
          <FrequencyPanel title="Waveform">
            <WaveformView analyser={selectedAnalyser} buffer={selectedBuffer} sampleRate={selectedSampleRate} />
          </FrequencyPanel>
          <FrequencyPanel title="Spectrogram">
            <SpectrogramView
              analyser={selectedAnalyser}
              buffer={selectedBuffer}
              sampleRate={selectedSampleRate}
              fftSize={effectiveFftSize}
              maxFrequency={effectiveMaxFrequency}
              highlightFundamental={highlightFundamental}
              highlightOvertones={highlightOvertones}
              showNoteLabels={showNoteLabels}
            />
          </FrequencyPanel>
          <FrequencyPanel title="Frequency Bars">
            <FrequencyBarsView
              analyser={selectedAnalyser}
              buffer={selectedBuffer}
              sampleRate={selectedSampleRate}
              fftSize={effectiveFftSize}
              maxFrequency={effectiveMaxFrequency}
              highlightFundamental={highlightFundamental}
              highlightOvertones={highlightOvertones}
              showNoteLabels={showNoteLabels}
            />
          </FrequencyPanel>
          <FrequencyPanel title="Piano">
            <div className="freq-analyzer-piano-inner keyboard-wrap">
              <PianoKeyboard
                noteCount={noteCount}
                pressedKeys={pressedKeys}
                onPressKey={handlePressKey}
                onReleaseKey={handleReleaseKey}
              />
            </div>
          </FrequencyPanel>
        </MfcSplitView>
      </div>
    </div>
  );
}
