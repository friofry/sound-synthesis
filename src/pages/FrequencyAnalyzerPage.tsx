import { type ReactNode, useEffect, useMemo, useState } from "react";
import { FrequencyBarsView } from "../components/FrequencyAnalyzer/FrequencyBarsView";
import { SpectrogramView } from "../components/FrequencyAnalyzer/SpectrogramView";
import { WaveformView } from "../components/FrequencyAnalyzer/WaveformView";
import { largestPowerOfTwoAtMost, MIN_FREQUENCY } from "../components/FrequencyAnalyzer/shared";
import { MfcSplitView } from "../components/ui/MfcSplitView";
import { useAudioAnalyserStore } from "../store/audioAnalyserStore";
import { usePianoStore } from "../store/pianoStore";

type FrequencyAnalyzerPageProps = {
  onBack: () => void;
};

const FFT_OPTIONS = [1024, 2048, 4096, 8192, 16384];

function FrequencyPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="freq-analyzer-panel">
      <header className="freq-analyzer-panel-title">{title}</header>
      <div className="freq-analyzer-panel-body">{children}</div>
    </section>
  );
}

export function FrequencyAnalyzerPage({ onBack }: FrequencyAnalyzerPageProps) {
  const engineAnalyser = useAudioAnalyserStore((state) => state.analyser);
  const activeBuffer = usePianoStore((state) => state.activeBuffer);
  const activeSampleRate = usePianoStore((state) => state.activeSampleRate);

  const [fftSize, setFftSize] = useState(1024);

  useEffect(() => {
    const liveEngineAnalyser = useAudioAnalyserStore.getState().analyser;
    if (liveEngineAnalyser) {
      liveEngineAnalyser.fftSize = fftSize;
    }
  }, [fftSize]);

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

        <span className="freq-toolbar-status">{statusText}</span>
      </div>

      <div className="freq-analyzer-content">
        <MfcSplitView orientation="vertical" defaultRatios={[0.25, 0.5, 0.25]} className="freq-analyzer-split-view">
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
            />
          </FrequencyPanel>
          <FrequencyPanel title="Frequency Bars">
            <FrequencyBarsView
              analyser={selectedAnalyser}
              buffer={selectedBuffer}
              sampleRate={selectedSampleRate}
              fftSize={effectiveFftSize}
              maxFrequency={effectiveMaxFrequency}
            />
          </FrequencyPanel>
        </MfcSplitView>
      </div>
    </div>
  );
}
