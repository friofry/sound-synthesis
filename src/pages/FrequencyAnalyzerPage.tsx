import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAudioAnalyserStore } from "../store/audioAnalyserStore";
import { usePianoStore } from "../store/pianoStore";
import {
  computeBufferSpectrum,
  projectDecibelSpectrumToLogBands,
  projectSpectrumToLogBands,
} from "../engine/audioSpectrum";

type FrequencyAnalyzerPageProps = {
  onBack: () => void;
};

type ViewMode = "spectrum" | "waterfall" | "combined";

const BAR_COUNT = 128;
const MIN_FREQUENCY = 20;
const MAX_FREQUENCY = 16000;
const FALLBACK_MIN_DB = -96;
const FALLBACK_MAX_DB = -12;
const WATERFALL_SCROLL_PX = 2;

const LABEL_FREQUENCIES = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 16000];

function formatFrequencyLabel(frequency: number): string {
  if (frequency >= 1000) {
    return `${(frequency / 1000).toFixed(frequency >= 10000 ? 0 : 1)}k`;
  }
  return `${Math.round(frequency)}`;
}

function dbToColor(normalized: number): string {
  const t = Math.max(0, Math.min(1, normalized));
  if (t < 0.2) {
    const s = t / 0.2;
    return `rgb(${Math.round(s * 20)}, ${Math.round(s * 10)}, ${Math.round(40 + s * 80)})`;
  }
  if (t < 0.4) {
    const s = (t - 0.2) / 0.2;
    return `rgb(${Math.round(20 + s * 10)}, ${Math.round(10 + s * 100)}, ${Math.round(120 + s * 60)})`;
  }
  if (t < 0.6) {
    const s = (t - 0.4) / 0.2;
    return `rgb(${Math.round(30 + s * 180)}, ${Math.round(110 + s * 90)}, ${Math.round(180 - s * 80)})`;
  }
  if (t < 0.8) {
    const s = (t - 0.6) / 0.2;
    return `rgb(${Math.round(210 + s * 45)}, ${Math.round(200 - s * 60)}, ${Math.round(100 - s * 70)})`;
  }
  const s = (t - 0.8) / 0.2;
  return `rgb(255, ${Math.round(140 - s * 140)}, ${Math.round(30 - s * 30)})`;
}

function drawDbScale(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  for (let i = 0; i < width; i++) {
    ctx.fillStyle = dbToColor(i / width);
    ctx.fillRect(x + i, y, 1, height);
  }
  ctx.strokeStyle = "#555";
  ctx.strokeRect(x, y, width, height);

  ctx.fillStyle = "#ccc";
  ctx.font = "10px Tahoma, Segoe UI, sans-serif";
  ctx.fillText("-96 dB", x, y + height + 12);
  ctx.fillText("-12 dB", x + width - 30, y + height + 12);
}

export function FrequencyAnalyzerPage({ onBack }: FrequencyAnalyzerPageProps) {
  const analyser = useAudioAnalyserStore((s) => s.analyser);
  const activeBuffer = usePianoStore((s) => s.activeBuffer);
  const activeSampleRate = usePianoStore((s) => s.activeSampleRate);
  const [mode, setMode] = useState<ViewMode>("combined");
  const [micActive, setMicActive] = useState(false);
  const [fftSize, setFftSize] = useState(4096);
  const [smoothing, setSmoothing] = useState(0.8);
  const [maxFrequency, setMaxFrequency] = useState(MAX_FREQUENCY);
  const [peakHold, setPeakHold] = useState(true);

  const fallbackSpectrum = useMemo(
    () => computeBufferSpectrum(activeBuffer, activeSampleRate, { algorithm: "fft", frameSize: 4096, binCount: 2048 }),
    [activeBuffer, activeSampleRate],
  );
  const fallbackBars = useMemo(
    () => projectSpectrumToLogBands(fallbackSpectrum, {
      barCount: BAR_COUNT,
      minFrequency: MIN_FREQUENCY,
      maxFrequency: Math.min(maxFrequency, activeSampleRate / 2),
      magnitudeTransform: "sqrt",
    }),
    [fallbackSpectrum, activeSampleRate, maxFrequency],
  );

  const spectrumCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const waterfallCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const peakValuesRef = useRef<number[]>(new Array(BAR_COUNT).fill(0));
  const peakDecayRef = useRef<number[]>(new Array(BAR_COUNT).fill(0));

  const micStreamRef = useRef<MediaStream | null>(null);
  const micContextRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);

  const waterfallImageRef = useRef<ImageData | null>(null);

  const activeAnalyser = micAnalyserRef.current ?? analyser;

  const startMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const micAnalyser = ctx.createAnalyser();
      micAnalyser.fftSize = fftSize;
      micAnalyser.smoothingTimeConstant = smoothing;
      source.connect(micAnalyser);
      micStreamRef.current = stream;
      micContextRef.current = ctx;
      micAnalyserRef.current = micAnalyser;
      setMicActive(true);
    } catch {
      setMicActive(false);
    }
  }, [fftSize, smoothing]);

  const stopMic = useCallback(() => {
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micContextRef.current?.close();
    micStreamRef.current = null;
    micContextRef.current = null;
    micAnalyserRef.current = null;
    setMicActive(false);
  }, []);

  useEffect(() => {
    return () => {
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micContextRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (activeAnalyser) {
      activeAnalyser.fftSize = fftSize;
      activeAnalyser.smoothingTimeConstant = smoothing;
    }
  }, [activeAnalyser, fftSize, smoothing]);

  useEffect(() => {
    const spectrumCanvas = spectrumCanvasRef.current;
    const waterfallCanvas = waterfallCanvasRef.current;

    let frameId = 0;
    const floatData = activeAnalyser ? new Float32Array(activeAnalyser.frequencyBinCount) : null;

    const render = () => {
      const showSpectrum = mode === "spectrum" || mode === "combined";
      const showWaterfall = mode === "waterfall" || mode === "combined";

      if (showSpectrum && spectrumCanvas) {
        renderSpectrum(spectrumCanvas, floatData);
      }
      if (showWaterfall && waterfallCanvas) {
        renderWaterfall(waterfallCanvas, floatData);
      }
      frameId = window.requestAnimationFrame(render);
    };

    const renderSpectrum = (canvas: HTMLCanvasElement, data: Float32Array | null) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const cssWidth = Math.max(1, Math.floor(rect.width));
      const cssHeight = Math.max(1, Math.floor(rect.height));

      if (canvas.width !== Math.floor(cssWidth * dpr) || canvas.height !== Math.floor(cssHeight * dpr)) {
        canvas.width = Math.floor(cssWidth * dpr);
        canvas.height = Math.floor(cssHeight * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssWidth, cssHeight);
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(0, 0, cssWidth, cssHeight);

      const chartLeft = 40;
      const chartRight = cssWidth - 16;
      const chartTop = 12;
      const chartBottom = cssHeight - 28;
      const chartWidth = Math.max(1, chartRight - chartLeft);
      const chartHeight = Math.max(1, chartBottom - chartTop);

      let values: number[] = new Array(BAR_COUNT).fill(0);
      let hasLiveData = false;

      if (activeAnalyser && data) {
        activeAnalyser.getFloatFrequencyData(data);
        const nyquist = activeAnalyser.context.sampleRate / 2;
        const minDb = Number.isFinite(activeAnalyser.minDecibels) ? activeAnalyser.minDecibels : FALLBACK_MIN_DB;
        const maxDb = Number.isFinite(activeAnalyser.maxDecibels) ? activeAnalyser.maxDecibels : FALLBACK_MAX_DB;
        values = projectDecibelSpectrumToLogBands(data, activeAnalyser.context.sampleRate, {
          barCount: BAR_COUNT,
          minFrequency: MIN_FREQUENCY,
          maxFrequency: Math.min(maxFrequency, nyquist),
          minDecibels: minDb,
          maxDecibels: maxDb,
        });
        hasLiveData = values.some((v) => v > 0);
      }

      if (!hasLiveData && fallbackBars.length > 0) {
        values = fallbackBars.slice();
      }

      const peaks = peakValuesRef.current;
      const decays = peakDecayRef.current;
      for (let i = 0; i < BAR_COUNT; i++) {
        if (values[i] > peaks[i]) {
          peaks[i] = values[i];
          decays[i] = 0;
        } else {
          decays[i] += 1;
          if (decays[i] > 30) {
            peaks[i] = Math.max(values[i], peaks[i] - 0.008);
          }
        }
      }

      ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
      for (let db = 0; db <= 1; db += 0.25) {
        const y = chartTop + chartHeight * (1 - db);
        ctx.beginPath();
        ctx.moveTo(chartLeft, y);
        ctx.lineTo(chartRight, y);
        ctx.stroke();
      }

      ctx.fillStyle = "rgba(200, 200, 200, 0.6)";
      ctx.font = "10px Tahoma, Segoe UI, sans-serif";
      const dbLabels = ["-96", "-72", "-48", "-24", "0"];
      dbLabels.forEach((label, i) => {
        const y = chartTop + chartHeight * (1 - i / (dbLabels.length - 1));
        ctx.fillText(label, 4, y + 3);
      });

      const barWidth = chartWidth / BAR_COUNT;
      for (let i = 0; i < BAR_COUNT; i++) {
        const value = values[i];
        const h = Math.max(0, value * chartHeight);
        const x = chartLeft + i * barWidth;

        const gradient = ctx.createLinearGradient(x, chartBottom, x, chartBottom - chartHeight);
        gradient.addColorStop(0, "#0d47a1");
        gradient.addColorStop(0.4, "#1e88e5");
        gradient.addColorStop(0.7, "#42a5f5");
        gradient.addColorStop(0.9, "#ffca28");
        gradient.addColorStop(1, "#ff5722");
        ctx.fillStyle = gradient;
        ctx.fillRect(x, chartBottom - h, Math.max(1, barWidth - 1), h);

        if (peakHold && peaks[i] > 0.01) {
          const peakY = chartBottom - peaks[i] * chartHeight;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(x, peakY, Math.max(1, barWidth - 1), 2);
        }
      }

      const logMin = Math.log(MIN_FREQUENCY);
      const logRange = Math.max(1e-9, Math.log(Math.min(maxFrequency, MAX_FREQUENCY)) - logMin);
      ctx.fillStyle = "rgba(200, 200, 200, 0.6)";
      ctx.font = "10px Tahoma, Segoe UI, sans-serif";
      LABEL_FREQUENCIES.filter((f) => f <= maxFrequency).forEach((freq) => {
        const xPos = chartLeft + ((Math.log(freq) - logMin) / logRange) * chartWidth;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
        ctx.beginPath();
        ctx.moveTo(xPos, chartTop);
        ctx.lineTo(xPos, chartBottom);
        ctx.stroke();
        ctx.fillStyle = "rgba(200, 200, 200, 0.6)";
        ctx.fillText(formatFrequencyLabel(freq), xPos - 8, cssHeight - 6);
      });

      ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      ctx.strokeRect(chartLeft, chartTop, chartWidth, chartHeight);
    };

    const renderWaterfall = (canvas: HTMLCanvasElement, data: Float32Array | null) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const cssWidth = Math.max(1, Math.floor(rect.width));
      const cssHeight = Math.max(1, Math.floor(rect.height));

      if (canvas.width !== Math.floor(cssWidth * dpr) || canvas.height !== Math.floor(cssHeight * dpr)) {
        canvas.width = Math.floor(cssWidth * dpr);
        canvas.height = Math.floor(cssHeight * dpr);
        waterfallImageRef.current = null;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const chartLeft = 40;
      const chartRight = cssWidth - 16;
      const chartTop = 12;
      const chartBottom = cssHeight - 28;
      const chartWidth = Math.max(1, chartRight - chartLeft);
      const chartHeight = Math.max(1, chartBottom - chartTop);

      let values: number[] = new Array(BAR_COUNT).fill(0);
      let hasLiveData = false;

      if (activeAnalyser && data) {
        activeAnalyser.getFloatFrequencyData(data);
        const nyquist = activeAnalyser.context.sampleRate / 2;
        const minDb = Number.isFinite(activeAnalyser.minDecibels) ? activeAnalyser.minDecibels : FALLBACK_MIN_DB;
        const maxDb = Number.isFinite(activeAnalyser.maxDecibels) ? activeAnalyser.maxDecibels : FALLBACK_MAX_DB;
        values = projectDecibelSpectrumToLogBands(data, activeAnalyser.context.sampleRate, {
          barCount: BAR_COUNT,
          minFrequency: MIN_FREQUENCY,
          maxFrequency: Math.min(maxFrequency, nyquist),
          minDecibels: minDb,
          maxDecibels: maxDb,
        });
        hasLiveData = values.some((v) => v > 0);
      }

      if (!hasLiveData && fallbackBars.length > 0) {
        values = fallbackBars.slice();
      }

      const scrollPx = WATERFALL_SCROLL_PX;

      if (waterfallImageRef.current) {
        const prev = waterfallImageRef.current;
        ctx.putImageData(prev, 0, 0);
      }

      const existing = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const shifted = ctx.createImageData(canvas.width, canvas.height);

      const rowBytes = canvas.width * 4;
      const shiftBytes = scrollPx * dpr * rowBytes;
      const topOffset = Math.round(chartTop * dpr) * rowBytes;
      const bottomOffset = Math.round(chartBottom * dpr) * rowBytes;

      for (let byteIdx = 0; byteIdx < existing.data.length; byteIdx += 4) {
        if (byteIdx >= topOffset && byteIdx < bottomOffset - shiftBytes) {
          shifted.data[byteIdx + shiftBytes] = existing.data[byteIdx];
          shifted.data[byteIdx + shiftBytes + 1] = existing.data[byteIdx + 1];
          shifted.data[byteIdx + shiftBytes + 2] = existing.data[byteIdx + 2];
          shifted.data[byteIdx + shiftBytes + 3] = existing.data[byteIdx + 3];
        }
      }

      ctx.putImageData(shifted, 0, 0);

      ctx.fillStyle = "#0a0a1a";
      ctx.fillRect(0, 0, cssWidth, chartTop);
      ctx.fillRect(0, chartBottom, cssWidth, cssHeight - chartBottom);
      ctx.fillRect(0, 0, chartLeft, cssHeight);
      ctx.fillRect(chartRight, 0, cssWidth - chartRight, cssHeight);

      const barW = chartWidth / BAR_COUNT;
      for (let i = 0; i < BAR_COUNT; i++) {
        const x = chartLeft + i * barW;
        ctx.fillStyle = dbToColor(values[i]);
        ctx.fillRect(x, chartTop, Math.max(1, barW), scrollPx);
      }

      waterfallImageRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const logMin = Math.log(MIN_FREQUENCY);
      const logRange = Math.max(1e-9, Math.log(Math.min(maxFrequency, MAX_FREQUENCY)) - logMin);
      ctx.fillStyle = "rgba(200, 200, 200, 0.6)";
      ctx.font = "10px Tahoma, Segoe UI, sans-serif";
      LABEL_FREQUENCIES.filter((f) => f <= maxFrequency).forEach((freq) => {
        const xPos = chartLeft + ((Math.log(freq) - logMin) / logRange) * chartWidth;
        ctx.fillText(formatFrequencyLabel(freq), xPos - 8, cssHeight - 6);
      });

      ctx.fillStyle = "rgba(200, 200, 200, 0.5)";
      ctx.fillText("time ↓", 4, chartTop + 14);

      drawDbScale(ctx, chartLeft, cssHeight - 24, Math.min(chartWidth, 180), 8);

      ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      ctx.strokeRect(chartLeft, chartTop, chartWidth, chartHeight);
    };

    render();
    return () => window.cancelAnimationFrame(frameId);
  }, [activeAnalyser, mode, maxFrequency, peakHold, fallbackBars]);

  return (
    <div className="freq-analyzer-page">
      <div className="freq-analyzer-toolbar">
        <button className="freq-toolbar-btn" onClick={onBack} title="Back to Membrane Modeller" aria-label="Back to Membrane Modeller">
          ⤵️
        </button>
        <span className="freq-toolbar-separator" />

        <label className="freq-toolbar-label">
          Mode:
          <select
            className="freq-toolbar-select"
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as ViewMode);
              waterfallImageRef.current = null;
            }}
          >
            <option value="spectrum">Spectrum</option>
            <option value="waterfall">Waterfall</option>
            <option value="combined">Combined</option>
          </select>
        </label>

        <label className="freq-toolbar-label">
          FFT:
          <select
            className="freq-toolbar-select"
            value={fftSize}
            onChange={(e) => setFftSize(Number(e.target.value))}
          >
            <option value={1024}>1024</option>
            <option value={2048}>2048</option>
            <option value={4096}>4096</option>
            <option value={8192}>8192</option>
            <option value={16384}>16384</option>
          </select>
        </label>

        <label className="freq-toolbar-label">
          Smoothing:
          <input
            type="range"
            className="freq-toolbar-range"
            min={0}
            max={0.99}
            step={0.01}
            value={smoothing}
            onChange={(e) => setSmoothing(Number(e.target.value))}
          />
          <span className="freq-toolbar-value">{smoothing.toFixed(2)}</span>
        </label>

        <label className="freq-toolbar-label">
          Max Freq:
          <select
            className="freq-toolbar-select"
            value={maxFrequency}
            onChange={(e) => setMaxFrequency(Number(e.target.value))}
          >
            <option value={2000}>2 kHz</option>
            <option value={5000}>5 kHz</option>
            <option value={8000}>8 kHz</option>
            <option value={16000}>16 kHz</option>
            <option value={22050}>22 kHz</option>
          </select>
        </label>

        <label className="freq-toolbar-label">
          <input
            type="checkbox"
            checked={peakHold}
            onChange={(e) => setPeakHold(e.target.checked)}
          />
          Peak hold
        </label>

        <span className="freq-toolbar-separator" />

        <button
          className={`freq-toolbar-btn ${micActive ? "freq-toolbar-btn-active" : ""}`}
          onClick={micActive ? stopMic : startMic}
        >
          {micActive ? "🎙️ Stop Mic" : "🎤 Mic Input"}
        </button>

        <span className="freq-toolbar-status">
          {activeAnalyser
            ? `Source: ${micActive ? "Microphone" : "Audio Engine"} · ${activeAnalyser.context.sampleRate} Hz · FFT ${activeAnalyser.fftSize}`
            : activeBuffer
              ? `Buffer: ${activeBuffer.length} samples · ${activeSampleRate} Hz`
              : "No audio source"}
        </span>
      </div>

      <div className="freq-analyzer-content">
        {(mode === "spectrum" || mode === "combined") && (
          <div className={`freq-analyzer-panel ${mode === "combined" ? "freq-analyzer-half" : ""}`}>
            <canvas ref={spectrumCanvasRef} className="freq-analyzer-canvas" />
          </div>
        )}
        {(mode === "waterfall" || mode === "combined") && (
          <div className={`freq-analyzer-panel ${mode === "combined" ? "freq-analyzer-half" : ""}`}>
            <canvas ref={waterfallCanvasRef} className="freq-analyzer-canvas" />
          </div>
        )}
      </div>
    </div>
  );
}
