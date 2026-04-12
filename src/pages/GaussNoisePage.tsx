import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FrequencyBarsView } from "../components/FrequencyAnalyzer/FrequencyBarsView";
import { SpectrogramView } from "../components/FrequencyAnalyzer/SpectrogramView";
import { largestPowerOfTwoAtMost, MIN_FREQUENCY } from "../components/FrequencyAnalyzer/shared";
import { LegacyOscillogrammWaveform } from "../components/PianoPlayer/LegacyOscillogrammWaveform";
import { MfcButton, MfcField, MfcForm, MfcSelect } from "../components/ui/MfcForm";
import { MfcSplitView } from "../components/ui/MfcSplitView";
import {
  MfcToolbar,
  type MfcToolbarItem,
  type MfcToolbarSeparator,
} from "../components/ui/MfcToolbar";
import {
  floatNoiseToInt16Pcm,
  generateGaussNoiseBuffer,
} from "../engine/gaussNoise/generateGaussNoise";
import { encodeWavBlob } from "../engine/snc/wavExport";
import { useAudioAnalyserStore } from "../store/audioAnalyserStore";
import { usePianoStore } from "../store/pianoStore";

const SAMPLE_RATES = [8000, 22050, 44100, 48000] as const;
const FFT_OPTIONS = [1024, 2048, 4096, 8192, 16384] as const;

const GAUSS_SPECTRUM_SPLIT = [0.58, 0.42] as const;

type GaussNoisePageProps = {
  onBack: () => void;
  onOpenFrequencyAnalyzer: () => void;
};

type GaussToolbarActionId = "back" | "none";

type GaussToolbarButton = MfcToolbarItem<GaussToolbarActionId> & {
  text?: string;
};

type GaussToolbarElement = GaussToolbarButton | MfcToolbarSeparator;

function GaussPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="freq-analyzer-panel gauss-noise-freq-panel">
      <header className="freq-analyzer-panel-title">{title}</header>
      <div className="freq-analyzer-panel-body">{children}</div>
    </section>
  );
}

function parsePositiveInt(raw: string, fallback: number): number {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function parsePositiveFloat(raw: string, fallback: number): number {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

type PlaybackGraph = {
  ctx: AudioContext;
  analyser: AnalyserNode;
  gain: GainNode;
  source: AudioBufferSourceNode | null;
};

export function GaussNoisePage({ onBack, onOpenFrequencyAnalyzer }: GaussNoisePageProps) {
  const setActiveBuffer = usePianoStore((s) => s.setActiveBuffer);
  const setGlobalAnalyser = useAudioAnalyserStore((s) => s.setAnalyser);

  const [sampleRate, setSampleRate] = useState<number>(44100);
  const [durationSeconds, setDurationSeconds] = useState("1");
  const [points, setPoints] = useState("250");
  const [dispersion, setDispersion] = useState("2.5");
  const [maxAmplitude, setMaxAmplitude] = useState("5000");
  const [seed, setSeed] = useState("");

  const [generatedBuffer, setGeneratedBuffer] = useState<Float32Array | null>(null);
  const [lastSeedUsed, setLastSeedUsed] = useState<number | null>(null);
  const [status, setStatus] = useState("");

  const [fftSize, setFftSize] = useState(8192);
  const [isPlaying, setIsPlaying] = useState(false);
  const [liveAnalyser, setLiveAnalyser] = useState<AnalyserNode | null>(null);

  const playbackRef = useRef<PlaybackGraph | null>(null);

  const effectiveFftSize = useMemo(() => {
    if (!generatedBuffer) {
      return fftSize;
    }
    const cap = largestPowerOfTwoAtMost(generatedBuffer.length);
    return Math.min(fftSize, Math.max(2, cap));
  }, [fftSize, generatedBuffer]);

  const previewSampleRate = useMemo(
    () => (generatedBuffer ? sampleRate : 44100),
    [generatedBuffer, sampleRate],
  );

  const effectiveMaxFrequency = Math.max(MIN_FREQUENCY, sampleRate / 2);

  const stopPlayback = useCallback(() => {
    const graph = playbackRef.current;
    if (graph?.source) {
      try {
        graph.source.stop();
      } catch {
        /* already stopped */
      }
      graph.source = null;
    }
    setIsPlaying(false);
    setLiveAnalyser(null);
    setGlobalAnalyser(null, "gauss-noise");
  }, [setGlobalAnalyser]);

  const startPlayback = useCallback(async () => {
    if (!generatedBuffer) {
      setStatus("Generate noise first.");
      return;
    }

    stopPlayback();

    let graph = playbackRef.current;
    if (!graph) {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = effectiveFftSize;
      analyser.smoothingTimeConstant = 0.72;
      const gain = ctx.createGain();
      gain.gain.value = 0.48;
      analyser.connect(gain);
      gain.connect(ctx.destination);
      graph = { ctx, analyser, gain, source: null };
      playbackRef.current = graph;
    }

    // Web Audio: fftSize is a mutable control parameter on AnalyserNode.
    // eslint-disable-next-line react-hooks/immutability -- intentional AudioParam-style assignment
    graph.analyser.fftSize = effectiveFftSize;

    await graph.ctx.resume();

    const audioBuffer = graph.ctx.createBuffer(1, generatedBuffer.length, sampleRate);
    audioBuffer.getChannelData(0).set(generatedBuffer);
    const source = graph.ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(graph.analyser);
    graph.source = source;
    source.onended = () => {
      stopPlayback();
    };

    setGlobalAnalyser(graph.analyser, "gauss-noise");
    setLiveAnalyser(graph.analyser);
    setIsPlaying(true);
    source.start();
  }, [effectiveFftSize, generatedBuffer, sampleRate, setGlobalAnalyser, stopPlayback]);

  useEffect(() => {
    if (liveAnalyser) {
      // eslint-disable-next-line react-hooks/immutability -- intentional AnalyserNode.fftSize update
      liveAnalyser.fftSize = effectiveFftSize;
    }
  }, [effectiveFftSize, liveAnalyser]);

  useEffect(
    () => () => {
      const graph = playbackRef.current;
      if (graph?.source) {
        try {
          graph.source.stop();
        } catch {
          /* noop */
        }
        graph.source = null;
      }
      setGlobalAnalyser(null, "gauss-noise");
    },
    [setGlobalAnalyser],
  );

  const handleGenerate = useCallback(() => {
    stopPlayback();
    const duration = parsePositiveFloat(durationSeconds, 0);
    if (duration <= 0 || duration > 120) {
      setStatus("Duration must be between 0 and 120 seconds.");
      return;
    }
    const pts = parsePositiveInt(points, 250);
    const disp = parsePositiveFloat(dispersion, 2.5);
    const maxA = parsePositiveFloat(maxAmplitude, 5000);
    if (maxA > 32767) {
      setStatus("Max amplitude must be at most 32767.");
      return;
    }
    const seedRaw = seed.trim();
    let seedUsed: number;
    if (seedRaw === "") {
      seedUsed = Math.floor(Math.random() * 0xffffffff) >>> 0;
    } else {
      const parsed = Number.parseInt(seedRaw, 10);
      if (!Number.isFinite(parsed) || parsed < 0) {
        setStatus("Seed must be a non-negative integer.");
        return;
      }
      seedUsed = parsed >>> 0;
    }

    try {
      const buffer = generateGaussNoiseBuffer({
        sampleRate,
        durationSeconds: duration,
        points: pts,
        dispersion: disp,
        maxAmplitude: maxA,
        seed: seedUsed,
      });
      setGeneratedBuffer(buffer);
      setLastSeedUsed(seedUsed);
      setActiveBuffer(buffer, sampleRate);
      setStatus(
        `${buffer.length} samples · seed ${seedUsed}${seedRaw === "" ? " (auto)" : ""}`,
      );
    } catch (error) {
      setStatus((error as Error).message);
    }
  }, [
    durationSeconds,
    dispersion,
    maxAmplitude,
    points,
    sampleRate,
    seed,
    setActiveBuffer,
    stopPlayback,
  ]);

  const handleDownloadWav = useCallback(() => {
    if (!generatedBuffer) {
      setStatus("Generate noise first.");
      return;
    }
    const pcm = floatNoiseToInt16Pcm(generatedBuffer);
    const blob = encodeWavBlob(pcm, sampleRate);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "gauss-noise.wav";
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [generatedBuffer, sampleRate]);

  const handlePlayToggle = useCallback(() => {
    if (isPlaying) {
      stopPlayback();
    } else {
      void startPlayback();
    }
  }, [isPlaying, startPlayback, stopPlayback]);

  const barsBuffer = isPlaying ? null : generatedBuffer;
  const barsAnalyser = liveAnalyser;

  const gaussToolbarItems: GaussToolbarElement[] = useMemo(
    () => [
      { id: "back", label: "Back", title: "Back", text: "⤵️" },
      { kind: "separator", id: "sep-1" },
    ],
    [],
  );

  return (
    <div className="gauss-noise-page">
      <div className="freq-analyzer-toolbar gauss-noise-toolbar" role="toolbar" aria-label="Gauss noise">
        <MfcToolbar
          hasToolbarRole={false}
          items={gaussToolbarItems}
          selectedId={"none"}
          onSelect={(id) => {
            if (id === "back") {
              onBack();
            }
          }}
          className="piano-toolbar-mfc"
          buttonClassName="toolbar-icon-btn"
          renderItem={(entry) => (
            <>
              {entry.text ? (
                <span aria-hidden>{entry.text}</span>
              ) : (
                <span>{entry.label}</span>
              )}
              <span className="sr-only">{entry.label}</span>
            </>
          )}
        />
        <span className="freq-toolbar-status gauss-noise-toolbar-status">{status || "Gaussian white noise (legacy-style scaling)"}</span>
      </div>

      <div className="gauss-noise-body">
        <div className="gauss-noise-left">
          <MfcForm
            title="Parameters"
            className="gauss-noise-parameters-form"
            footer={
              <>
                <MfcButton type="button" defaultAction onClick={handleGenerate}>
                  Generate
                </MfcButton>
                <MfcButton
                  type="button"
                  onClick={handlePlayToggle}
                  disabled={!generatedBuffer}
                  pressed={isPlaying}
                >
                  {isPlaying ? "Stop" : "Play"}
                </MfcButton>
                <MfcButton type="button" onClick={handleDownloadWav} disabled={!generatedBuffer}>
                  Save WAV…
                </MfcButton>
              </>
            }
          >
            <MfcField label="Sample rate">
              <MfcSelect
                value={String(sampleRate)}
                options={SAMPLE_RATES.map((hz) => ({ value: String(hz), label: `${hz} Hz` }))}
                onChange={(value) => setSampleRate(Number(value))}
              />
            </MfcField>

            <MfcField label="Duration (s)">
              <input
                type="text"
                inputMode="decimal"
                value={durationSeconds}
                onChange={(event) => setDurationSeconds(event.target.value)}
              />
            </MfcField>

            <MfcField label="Points">
              <input
                type="text"
                inputMode="numeric"
                value={points}
                onChange={(event) => setPoints(event.target.value)}
              />
            </MfcField>

            <MfcField label="Dispersion">
              <input
                type="text"
                inputMode="decimal"
                value={dispersion}
                onChange={(event) => setDispersion(event.target.value)}
              />
            </MfcField>

            <MfcField label="Max amplitude">
              <input
                type="text"
                inputMode="numeric"
                value={maxAmplitude}
                onChange={(event) => setMaxAmplitude(event.target.value)}
              />
            </MfcField>

            <MfcField label="Seed (empty = random)" labelWidth={168}>
              <input
                type="text"
                inputMode="numeric"
                placeholder="auto"
                value={seed}
                onChange={(event) => setSeed(event.target.value)}
              />
            </MfcField>

            {lastSeedUsed !== null && seed.trim() === "" ? (
              <p className="mfc-form-hint">Last seed: {lastSeedUsed} — enter it to reproduce.</p>
            ) : null}
          </MfcForm>

          <MfcForm title="Waveform" className="gauss-noise-waveform-form">
            <div className="gauss-noise-waveform-inner">
              <LegacyOscillogrammWaveform
                buffer={generatedBuffer}
                sampleRate={previewSampleRate}
                navigationButton={{
                  label: "Open Frequency Analyzer",
                  title: "Open Frequency Analyzer",
                  text: "⤴️",
                  onClick: onOpenFrequencyAnalyzer,
                }}
              />
            </div>
          </MfcForm>
        </div>

        <div className="gauss-noise-spectrum-column">
          <div className="gauss-noise-spectrum-toolbar" role="toolbar" aria-label="FFT">
            <div className="mfc-toolbar-fft-wrap">
              <span className="sr-only">FFT bin size</span>
              <MfcSelect
                className="mfc-toolbar-select"
                value={String(fftSize)}
                options={FFT_OPTIONS.map((option) => ({
                  value: String(option),
                  label: String(option),
                }))}
                onChange={(value) => setFftSize(Number(value))}
                title="FFT bin size"
                aria-label="FFT bin size"
              />
            </div>
            {generatedBuffer && effectiveFftSize !== fftSize ? (
              <span className="gauss-noise-fft-note">capped to {effectiveFftSize}</span>
            ) : null}
          </div>

          <MfcSplitView
            orientation="vertical"
            className="gauss-noise-spectrum-split"
            defaultRatios={[...GAUSS_SPECTRUM_SPLIT]}
            minPaneSize={64}
          >
            <GaussPanel title="Spectrogram">
              <SpectrogramView
                analyser={null}
                buffer={generatedBuffer}
                sampleRate={previewSampleRate}
                fftSize={effectiveFftSize}
                maxFrequency={effectiveMaxFrequency}
              />
            </GaussPanel>
            <GaussPanel title="Frequency Bars">
              <FrequencyBarsView
                analyser={barsAnalyser}
                buffer={barsBuffer}
                sampleRate={previewSampleRate}
                fftSize={effectiveFftSize}
                maxFrequency={effectiveMaxFrequency}
              />
            </GaussPanel>
          </MfcSplitView>
        </div>
      </div>
    </div>
  );
}
