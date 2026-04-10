import { useEffect, useMemo, useRef } from "react";
import {
  computeBufferSpectrum,
  projectDecibelSpectrumToLogBands,
  projectSpectrumToLogBands,
} from "../../engine/audioSpectrum";
import {
  FALLBACK_MAX_DB,
  FALLBACK_MIN_DB,
  formatFrequencyLabel,
  LABEL_FREQUENCIES,
  MIN_FREQUENCY,
  resizeCanvas,
} from "./shared";

type FrequencyBarsViewProps = {
  analyser: AnalyserNode | null;
  buffer: Float32Array | null;
  sampleRate: number;
  fftSize: number;
  maxFrequency: number;
};

const BAR_COUNT = 96;

export function FrequencyBarsView({
  analyser,
  buffer,
  sampleRate,
  fftSize,
  maxFrequency,
}: FrequencyBarsViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bufferSpectrum = useMemo(
    () => computeBufferSpectrum(buffer, sampleRate, {
      algorithm: "fft",
      frameSize: fftSize,
      binCount: Math.max(1, Math.floor(fftSize / 2) - 1),
    }),
    [buffer, fftSize, sampleRate],
  );
  const bufferBars = useMemo(
    () => projectSpectrumToLogBands(bufferSpectrum, {
      barCount: BAR_COUNT,
      minFrequency: MIN_FREQUENCY,
      maxFrequency: Math.min(maxFrequency, sampleRate / 2),
      magnitudeTransform: "sqrt",
    }),
    [bufferSpectrum, maxFrequency, sampleRate],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let animationFrameId = 0;
    let liveData = analyser ? new Float32Array(analyser.frequencyBinCount) : null;

    const render = () => {
      const resized = resizeCanvas(canvas);
      if (!resized) {
        return;
      }

      const { ctx, layout } = resized;
      ctx.clearRect(0, 0, layout.cssWidth, layout.cssHeight);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, layout.cssWidth, layout.cssHeight);

      ctx.strokeStyle = "#909090";
      ctx.strokeRect(layout.chartLeft, layout.chartTop, layout.chartWidth, layout.chartHeight);

      [0.25, 0.5, 0.75].forEach((ratio) => {
        const y = layout.chartTop + layout.chartHeight * (1 - ratio);
        ctx.strokeStyle = "#d6d6d6";
        ctx.beginPath();
        ctx.moveTo(layout.chartLeft, y + 0.5);
        ctx.lineTo(layout.chartRight, y + 0.5);
        ctx.stroke();
      });

      let values = bufferBars.slice();

      if ((!buffer || buffer.length === 0) && analyser) {
        if (!liveData || liveData.length !== analyser.frequencyBinCount) {
          liveData = new Float32Array(analyser.frequencyBinCount);
        }
        analyser.getFloatFrequencyData(liveData);
        const minDb = Number.isFinite(analyser.minDecibels) ? analyser.minDecibels : FALLBACK_MIN_DB;
        const maxDb = Number.isFinite(analyser.maxDecibels) ? analyser.maxDecibels : FALLBACK_MAX_DB;
        values = projectDecibelSpectrumToLogBands(liveData, analyser.context.sampleRate, {
          barCount: BAR_COUNT,
          minFrequency: MIN_FREQUENCY,
          maxFrequency: Math.min(maxFrequency, analyser.context.sampleRate / 2),
          minDecibels: minDb,
          maxDecibels: maxDb,
        });
      }

      if (!values.some((value) => value > 0)) {
        ctx.fillStyle = "#666666";
        ctx.font = "10px Tahoma, Segoe UI, sans-serif";
        ctx.fillText("No frequency data", layout.chartLeft + 8, layout.chartTop + 14);
      } else {
        const barWidth = layout.chartWidth / BAR_COUNT;
        for (let index = 0; index < BAR_COUNT; index += 1) {
          const value = values[index] ?? 0;
          const height = value * layout.chartHeight;
          const x = layout.chartLeft + index * barWidth;

          ctx.fillStyle = "#203b6d";
          ctx.fillRect(x, layout.chartBottom - height, Math.max(1, barWidth - 1), height);
          ctx.strokeStyle = "#5d7bb4";
          ctx.strokeRect(x, layout.chartBottom - height, Math.max(1, barWidth - 1), height);
        }
      }

      ctx.fillStyle = "#000000";
      ctx.font = "10px Tahoma, Segoe UI, sans-serif";
      ctx.fillText("1.0", 16, layout.chartTop + 4);
      ctx.fillText("0.5", 16, layout.chartTop + layout.chartHeight / 2 + 3);
      ctx.fillText("0", 24, layout.chartBottom - 2);

      const limitedLabels = LABEL_FREQUENCIES.filter((frequency) => frequency <= maxFrequency);
      const logMin = Math.log(MIN_FREQUENCY);
      const logRange = Math.max(1e-9, Math.log(Math.min(maxFrequency, sampleRate / 2)) - logMin);
      limitedLabels.forEach((frequency) => {
        const x = layout.chartLeft + ((Math.log(frequency) - logMin) / logRange) * layout.chartWidth;
        ctx.strokeStyle = "#d6d6d6";
        ctx.beginPath();
        ctx.moveTo(x + 0.5, layout.chartTop);
        ctx.lineTo(x + 0.5, layout.chartBottom);
        ctx.stroke();
        ctx.fillStyle = "#000000";
        ctx.fillText(formatFrequencyLabel(frequency), Math.max(0, x - 12), layout.cssHeight - 6);
      });

      if ((!buffer || buffer.length === 0) && analyser) {
        animationFrameId = window.requestAnimationFrame(render);
      }
    };

    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => render()) : null;
    observer?.observe(canvas);
    window.addEventListener("resize", render);
    render();

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", render);
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [analyser, buffer, bufferBars, maxFrequency, sampleRate]);

  return <canvas ref={canvasRef} className="freq-analyzer-canvas freq-analyzer-bars-canvas" />;
}
