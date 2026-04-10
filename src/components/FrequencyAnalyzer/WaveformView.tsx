import { useEffect, useRef } from "react";
import { clamp, formatTimeLabel, resizeCanvas } from "./shared";

type WaveformViewProps = {
  analyser: AnalyserNode | null;
  buffer: Float32Array | null;
  sampleRate: number;
};

function drawWaveformAxes(
  ctx: CanvasRenderingContext2D,
  left: number,
  right: number,
  top: number,
  bottom: number,
  centerY: number,
) {
  ctx.strokeStyle = "#c7c7c7";
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.moveTo(left, top + 0.5);
  ctx.lineTo(right, top + 0.5);
  ctx.moveTo(left, centerY + 0.5);
  ctx.lineTo(right, centerY + 0.5);
  ctx.moveTo(left, bottom + 0.5);
  ctx.lineTo(right, bottom + 0.5);
  ctx.stroke();
}

function drawDawStyleWaveform(
  ctx: CanvasRenderingContext2D,
  chartLeft: number,
  centerY: number,
  chartHeight: number,
  maxEnvelope: Float64Array,
  minEnvelope: Float64Array,
  fillColor: string,
  strokeColor: string,
) {
  const w = maxEnvelope.length;
  if (w < 2) {
    return;
  }

  const halfH = chartHeight / 2;

  ctx.beginPath();
  const x0 = chartLeft;
  ctx.moveTo(x0, centerY - maxEnvelope[0] * halfH);
  for (let i = 1; i < w; i += 1) {
    ctx.lineTo(chartLeft + i, centerY - maxEnvelope[i] * halfH);
  }
  for (let i = w - 1; i >= 0; i -= 1) {
    ctx.lineTo(chartLeft + i, centerY - minEnvelope[i] * halfH);
  }
  ctx.closePath();

  ctx.fillStyle = fillColor;
  ctx.globalAlpha = 0.88;
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, centerY - maxEnvelope[0] * halfH);
  for (let i = 1; i < w; i += 1) {
    ctx.lineTo(chartLeft + i, centerY - maxEnvelope[i] * halfH);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x0, centerY - minEnvelope[0] * halfH);
  for (let i = 1; i < w; i += 1) {
    ctx.lineTo(chartLeft + i, centerY - minEnvelope[i] * halfH);
  }
  ctx.stroke();
}

export function WaveformView({ analyser, buffer, sampleRate }: WaveformViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let animationFrameId = 0;
    let liveData = analyser ? new Float32Array(analyser.fftSize) : null;

    const render = () => {
      const resized = resizeCanvas(canvas);
      if (!resized) {
        return;
      }

      const { ctx, layout } = resized;
      const centerY = layout.chartTop + layout.chartHeight / 2;
      const waveformFill = "rgba(77, 143, 216, 0.55)";
      const waveformStrokeColor = "#2f6fb6";

      ctx.clearRect(0, 0, layout.cssWidth, layout.cssHeight);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, layout.cssWidth, layout.cssHeight);

      drawWaveformAxes(ctx, layout.chartLeft, layout.chartRight, layout.chartTop, layout.chartBottom, centerY);

      ctx.strokeStyle = "#909090";
      ctx.strokeRect(layout.chartLeft, layout.chartTop, layout.chartWidth, layout.chartHeight);

      ctx.fillStyle = "#000000";
      ctx.font = "10px Tahoma, Segoe UI, sans-serif";
      ctx.fillText("+1.0", 8, layout.chartTop + 4);
      ctx.fillText("0", 18, centerY + 3);
      ctx.fillText("-1.0", 8, layout.chartBottom - 2);

      const tickCount = 5;
      const durationSeconds = buffer ? buffer.length / sampleRate : analyser ? analyser.fftSize / sampleRate : 0;
      for (let tick = 0; tick < tickCount; tick += 1) {
        const ratio = tick / (tickCount - 1);
        const x = layout.chartLeft + ratio * layout.chartWidth;
        ctx.strokeStyle = "#c7c7c7";
        ctx.beginPath();
        ctx.moveTo(x + 0.5, layout.chartBottom);
        ctx.lineTo(x + 0.5, layout.chartBottom + 4);
        ctx.stroke();
        ctx.fillStyle = "#000000";
        ctx.fillText(formatTimeLabel(durationSeconds * ratio), Math.max(0, x - 14), layout.cssHeight - 6);
      }

      if (buffer && buffer.length > 0) {
        let peakAmplitude = 0;
        for (let sampleIndex = 0; sampleIndex < buffer.length; sampleIndex += 1) {
          const amplitude = Math.abs(buffer[sampleIndex] ?? 0);
          if (amplitude > peakAmplitude) {
            peakAmplitude = amplitude;
          }
        }
        const w = layout.chartWidth;
        const samplesPerPixel = buffer.length / w;
        const maxNorm = new Float64Array(w);
        const minNorm = new Float64Array(w);

        for (let pixelIndex = 0; pixelIndex < w; pixelIndex += 1) {
          const startIndex = Math.floor(pixelIndex * samplesPerPixel);
          const endIndex = Math.min(buffer.length, Math.max(startIndex + 1, Math.floor((pixelIndex + 1) * samplesPerPixel)));
          let minValue = Number.POSITIVE_INFINITY;
          let maxValue = Number.NEGATIVE_INFINITY;

          for (let sampleIndex = startIndex; sampleIndex < endIndex; sampleIndex += 1) {
            const sample = buffer[sampleIndex] ?? 0;
            if (sample < minValue) {
              minValue = sample;
            }
            if (sample > maxValue) {
              maxValue = sample;
            }
          }

          if (minValue === Number.POSITIVE_INFINITY) {
            minValue = 0;
            maxValue = 0;
          }

          maxNorm[pixelIndex] = clamp(maxValue, -1, 1);
          minNorm[pixelIndex] = clamp(minValue, -1, 1);
        }

        drawDawStyleWaveform(
          ctx,
          layout.chartLeft,
          centerY,
          layout.chartHeight,
          maxNorm,
          minNorm,
          waveformFill,
          waveformStrokeColor,
        );

        ctx.fillStyle = "#000000";
        ctx.fillText(`peak ${peakAmplitude.toFixed(3)} (−1…+1 scale)`, layout.chartLeft + 8, layout.chartTop + 14);
      } else if (analyser) {
        if (!liveData || liveData.length !== analyser.fftSize) {
          liveData = new Float32Array(analyser.fftSize);
        }
        analyser.getFloatTimeDomainData(liveData);

        let peakAmplitude = 0;
        for (let index = 0; index < liveData.length; index += 1) {
          const amplitude = Math.abs(liveData[index] ?? 0);
          if (amplitude > peakAmplitude) {
            peakAmplitude = amplitude;
          }
        }
        const w = layout.chartWidth;
        const maxNorm = new Float64Array(w);
        const minNorm = new Float64Array(w);
        const bucketSize = liveData.length / w;

        for (let pixelIndex = 0; pixelIndex < w; pixelIndex += 1) {
          const startIndex = Math.floor(pixelIndex * bucketSize);
          const endIndex = Math.min(liveData.length, Math.max(startIndex + 1, Math.floor((pixelIndex + 1) * bucketSize)));
          let minValue = Number.POSITIVE_INFINITY;
          let maxValue = Number.NEGATIVE_INFINITY;
          for (let sampleIndex = startIndex; sampleIndex < endIndex; sampleIndex += 1) {
            const sample = liveData[sampleIndex] ?? 0;
            if (sample < minValue) {
              minValue = sample;
            }
            if (sample > maxValue) {
              maxValue = sample;
            }
          }
          if (minValue === Number.POSITIVE_INFINITY) {
            minValue = 0;
            maxValue = 0;
          }
          maxNorm[pixelIndex] = clamp(maxValue, -1, 1);
          minNorm[pixelIndex] = clamp(minValue, -1, 1);
        }

        drawDawStyleWaveform(
          ctx,
          layout.chartLeft,
          centerY,
          layout.chartHeight,
          maxNorm,
          minNorm,
          waveformFill,
          waveformStrokeColor,
        );

        ctx.fillStyle = "#000000";
        ctx.fillText(`peak ${peakAmplitude.toFixed(3)} (−1…+1 scale)`, layout.chartLeft + 8, layout.chartTop + 14);
      } else {
        ctx.fillStyle = "#666666";
        ctx.fillText("No waveform data", layout.chartLeft + 8, layout.chartTop + 14);
      }

      if (analyser) {
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
  }, [analyser, buffer, sampleRate]);

  return <canvas ref={canvasRef} className="freq-analyzer-canvas freq-analyzer-waveform-canvas" />;
}
