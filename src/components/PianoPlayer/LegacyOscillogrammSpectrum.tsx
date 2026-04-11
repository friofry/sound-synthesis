import { useEffect, useMemo, useRef } from "react";
import { computeBufferSpectrum } from "../../engine/audioSpectrum";

const SPECTRUM_HEIGHT = 95;

type LegacyOscillogrammSpectrumProps = {
  analyser: AnalyserNode | null;
  sampleRate: number;
  buffer: Float32Array | null;
  compact?: boolean;
};

export function LegacyOscillogrammSpectrum({
  analyser,
  sampleRate,
  buffer,
  compact = false,
}: LegacyOscillogrammSpectrumProps) {
  const spectrumCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastLiveSpectrumAtRef = useRef(0);
  const fallbackSpectrum = useMemo(
    () => computeBufferSpectrum(buffer, sampleRate, { algorithm: "fft", frameSize: 1024, binCount: 64 })
      .map((point) => point.magnitude),
    [buffer, sampleRate],
  );

  useEffect(() => {
    const canvas = spectrumCanvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    let frameId = 0;
    const byteData = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;

    const render = () => {
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
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, cssWidth, cssHeight);

      ctx.strokeStyle = "#000";
      ctx.beginPath();
      ctx.moveTo(0, cssHeight - 16.5);
      ctx.lineTo(cssWidth, cssHeight - 16.5);
      ctx.stroke();

      let values: number[] = [];
      const now = performance.now();

      if (analyser && byteData) {
        analyser.getByteFrequencyData(byteData);
        const slice = byteData.slice(2, Math.min(byteData.length, 256));
        const liveValues = Array.from(slice, (value) => value / 255);
        const livePeak = liveValues.reduce((peak, value) => Math.max(peak, value), 0);
        if (livePeak > 0.02) {
          lastLiveSpectrumAtRef.current = now;
          values = liveValues;
        } else if (now - lastLiveSpectrumAtRef.current < 220) {
          values = liveValues;
        }
      }

      if (!values.length) {
        values = fallbackSpectrum;
      }

      if (!values.length) {
        ctx.fillStyle = "#666";
        ctx.font = "11px Tahoma, Segoe UI, sans-serif";
        ctx.fillText("No spectrum data", 8, 14);
        frameId = window.requestAnimationFrame(render);
        return;
      }

      const chartHeight = cssHeight - 22;
      const baselineY = chartHeight;
      const stepX = cssWidth / Math.max(1, values.length - 1);
      let peakValue = 0;
      let peakIndex = 0;

      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.moveTo(0, baselineY);
      for (let i = 0; i < values.length; i += 1) {
        const value = values[i];
        if (value > peakValue) {
          peakValue = value;
          peakIndex = i;
        }
        const x = i * stepX;
        const y = baselineY - value * chartHeight;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(cssWidth, baselineY);
      ctx.closePath();
      ctx.fill();

      const approxMaxFrequency = Math.min(2000, Math.floor(sampleRate / 2));
      const peakHz = Math.round((peakIndex / Math.max(1, values.length - 1)) * approxMaxFrequency);
      const peakX = peakIndex * stepX;
      const peakY = baselineY - peakValue * chartHeight;
      ctx.fillStyle = "#000";
      ctx.font = "10px Tahoma, Segoe UI, sans-serif";
      const peakLabelX = Math.max(0, Math.min(cssWidth - 28, peakX - 8));
      const peakLabelY = Math.max(10, peakY - 6);
      ctx.fillText(String(peakHz), peakLabelX, peakLabelY);

      const labels = ["40 Hz", "236", "432", "628", "824", "1021", "1217", "1413", "1609", "1805", "1999"];
      labels.forEach((label, index) => {
        const x = (cssWidth * index) / (labels.length - 1);
        ctx.fillText(label, Math.max(0, x - 12), cssHeight - 3);
      });

      frameId = window.requestAnimationFrame(render);
    };

    render();
    return () => window.cancelAnimationFrame(frameId);
  }, [analyser, fallbackSpectrum, sampleRate]);

  return (
    <canvas
      ref={spectrumCanvasRef}
      className="legacy-oscillogramm-spectrum"
      style={{ height: compact ? "100%" : SPECTRUM_HEIGHT }}
    />
  );
}
