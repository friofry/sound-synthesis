import { useEffect, useMemo, useRef } from "react";
import {
  computeBufferSpectrum,
  projectDecibelSpectrumToLogBands,
  projectSpectrumToLogBands,
} from "../../engine/audioSpectrum";

type FrequencyAnalyzerProps = {
  analyser: AnalyserNode | null;
  buffer: Float32Array | null;
  sampleRate: number;
};

const BAR_COUNT = 72;
const MIN_FREQUENCY = 30;
const TARGET_MAX_FREQUENCY = 5000;
const FALLBACK_MIN_DB = -96;
const FALLBACK_MAX_DB = -12;

function formatFrequencyLabel(frequency: number): string {
  if (frequency >= 1000) {
    return `${(frequency / 1000).toFixed(frequency >= 10000 ? 0 : 1)}k`;
  }
  return `${Math.round(frequency)}`;
}

export function FrequencyAnalyzer({ analyser, buffer, sampleRate }: FrequencyAnalyzerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fallbackSpectrum = useMemo(
    () => computeBufferSpectrum(buffer, sampleRate, { algorithm: "fft", frameSize: 1024, binCount: 256 }),
    [buffer, sampleRate],
  );
  const fallbackBars = useMemo(
    () => projectSpectrumToLogBands(fallbackSpectrum, {
      barCount: BAR_COUNT,
      minFrequency: MIN_FREQUENCY,
      maxFrequency: Math.min(TARGET_MAX_FREQUENCY, sampleRate / 2),
      magnitudeTransform: "sqrt",
    }),
    [fallbackSpectrum, sampleRate],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    let frameId = 0;
    const floatData = analyser ? new Float32Array(analyser.frequencyBinCount) : null;

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
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, cssWidth, cssHeight);

      ctx.strokeStyle = "#000000";
      ctx.beginPath();
      ctx.moveTo(0, cssHeight - 16.5);
      ctx.lineTo(cssWidth, cssHeight - 16.5);
      ctx.stroke();

      const chartTop = 2;
      const chartBottom = cssHeight - 22;
      const chartHeight = Math.max(1, chartBottom - chartTop);
      let values: number[] = new Array(BAR_COUNT).fill(0);
      let maxFrequency = Math.min(TARGET_MAX_FREQUENCY, sampleRate / 2);
      let hasSpectrumData = false;

      const logMin = Math.log(MIN_FREQUENCY);
      const safeLogRange = (maxFrequency: number): number =>
        Math.max(1e-9, Math.log(Math.max(maxFrequency, MIN_FREQUENCY + 1e-6)) - logMin);
      const applyFallbackBars = () => {
        maxFrequency = Math.min(TARGET_MAX_FREQUENCY, sampleRate / 2);
        values = fallbackBars.slice();
        hasSpectrumData = values.some((value) => value > 0);
      };

      if (analyser && floatData) {
        analyser.getFloatFrequencyData(floatData);

        const nyquist = analyser.context.sampleRate / 2;
        maxFrequency = Math.min(TARGET_MAX_FREQUENCY, nyquist);
        const minDb = Number.isFinite(analyser.minDecibels) ? analyser.minDecibels : FALLBACK_MIN_DB;
        const maxDb = Number.isFinite(analyser.maxDecibels) ? analyser.maxDecibels : FALLBACK_MAX_DB;
        values = projectDecibelSpectrumToLogBands(floatData, analyser.context.sampleRate, {
          barCount: BAR_COUNT,
          minFrequency: MIN_FREQUENCY,
          maxFrequency,
          minDecibels: minDb,
          maxDecibels: maxDb,
        });
        hasSpectrumData = values.some((value) => value > 0);
        if (!hasSpectrumData && fallbackBars.length > 0) {
          applyFallbackBars();
        }
      } else {
        applyFallbackBars();
      }

      if (!hasSpectrumData) {
        ctx.fillStyle = "#666";
        ctx.font = "11px Tahoma, Segoe UI, sans-serif";
        ctx.fillText("No spectrum data", 8, 14);
        frameId = window.requestAnimationFrame(render);
        return;
      }

      const barWidth = cssWidth / values.length;

      ctx.strokeStyle = "#d0d0d0";
      [0.25, 0.5, 0.75].forEach((ratio) => {
        const y = Math.round(chartTop + chartHeight * (1 - ratio)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(cssWidth, y);
        ctx.stroke();
      });

      ctx.fillStyle = "#111111";
      for (let i = 0; i < values.length; i += 1) {
        const value = values[i];
        const h = Math.max(1, value * chartHeight);
        ctx.fillRect(i * barWidth, chartBottom - h, Math.max(1, barWidth - 1), h);
      }

      ctx.fillStyle = "#000";
      ctx.font = "10px Tahoma, Segoe UI, sans-serif";
      const labelFrequencies = [50, 100, 200, 500, 1000, 2000, 5000].filter((freq) => freq <= maxFrequency);
      const logRange = safeLogRange(maxFrequency);
      labelFrequencies.forEach((frequency) => {
        const x = ((Math.log(frequency) - logMin) / logRange) * cssWidth;
        ctx.beginPath();
        ctx.moveTo(x + 0.5, chartBottom + 1);
        ctx.lineTo(x + 0.5, chartBottom + 4);
        ctx.stroke();
        ctx.fillText(formatFrequencyLabel(frequency), Math.max(0, x - 10), cssHeight - 3);
      });

      frameId = window.requestAnimationFrame(render);
    };

    render();
    return () => window.cancelAnimationFrame(frameId);
  }, [analyser, fallbackBars, sampleRate]);

  return <canvas ref={canvasRef} className="frequency-canvas" />;
}
