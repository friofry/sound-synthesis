import { useEffect, useMemo, useRef } from "react";
import { computeSTFT, magnitudeToDecibels } from "../../engine/audioSpectrum";
import {
  drawSpectrogramPitchOverlay,
  findDominantFrequencyDecibels,
  findDominantFrequencyLinearMagnitudes,
  pickLoudestStftFrameIndex,
} from "./pitchAnalysis";
import {
  clamp,
  dbToSpectrogramColor,
  FALLBACK_MAX_DB,
  FALLBACK_MIN_DB,
  formatFrequencyLabel,
  formatTimeLabel,
  LABEL_FREQUENCIES,
  MIN_FREQUENCY,
  resizeCanvas,
} from "./shared";

type SpectrogramViewProps = {
  analyser: AnalyserNode | null;
  buffer: Float32Array | null;
  sampleRate: number;
  fftSize: number;
  maxFrequency: number;
  highlightFundamental?: boolean;
  highlightOvertones?: boolean;
  showNoteLabels?: boolean;
};

const LIVE_COLUMN_MS = 30;
const BUFFER_DYNAMIC_RANGE_DB = 72;

type FrequencyBand = {
  startFrequency: number;
  endFrequency: number;
};

function buildLogBands(rowCount: number, maxFrequency: number): FrequencyBand[] {
  const logMin = Math.log(MIN_FREQUENCY);
  const logRange = Math.max(1e-9, Math.log(maxFrequency) - logMin);

  return Array.from({ length: rowCount }, (_, rowIndex) => {
    const startRatio = rowIndex / rowCount;
    const endRatio = (rowIndex + 1) / rowCount;
    return {
      startFrequency: Math.exp(logMin + startRatio * logRange),
      endFrequency: Math.exp(logMin + endRatio * logRange),
    };
  });
}

function getFrameRangeMagnitude(
  frame: Float64Array,
  startFrequency: number,
  endFrequency: number,
  sampleRate: number,
  frameSize: number,
): number {
  const startBin = clamp(Math.floor((startFrequency * frameSize) / sampleRate) - 1, 0, frame.length - 1);
  const endBin = clamp(Math.ceil((endFrequency * frameSize) / sampleRate) - 1, startBin, frame.length - 1);
  let maxMagnitude = 0;
  for (let binIndex = startBin; binIndex <= endBin; binIndex += 1) {
    const value = frame[binIndex] ?? 0;
    if (value > maxMagnitude) {
      maxMagnitude = value;
    }
  }
  return maxMagnitude;
}

function getLiveRangeLevel(
  frame: Float32Array,
  startFrequency: number,
  endFrequency: number,
  sampleRate: number,
  minDb: number,
  maxDb: number,
): number {
  const nyquist = sampleRate / 2;
  const startBin = clamp(Math.floor((startFrequency / nyquist) * frame.length), 0, frame.length - 1);
  const endBin = clamp(Math.ceil((endFrequency / nyquist) * frame.length), startBin, frame.length - 1);
  let peakDb = minDb;
  for (let binIndex = startBin; binIndex <= endBin; binIndex += 1) {
    const value = frame[binIndex] ?? minDb;
    if (value > peakDb) {
      peakDb = value;
    }
  }
  return clamp((peakDb - minDb) / Math.max(1e-6, maxDb - minDb), 0, 1);
}

function drawOverlay(
  ctx: CanvasRenderingContext2D,
  cssWidth: number,
  cssHeight: number,
  chartLeft: number,
  chartTop: number,
  chartRight: number,
  chartBottom: number,
  chartWidth: number,
  chartHeight: number,
  maxFrequency: number,
  timeLabels: string[],
  skipBuiltinHzGrid: boolean,
) {
  ctx.fillStyle = "rgba(14, 14, 20, 0.9)";
  ctx.fillRect(0, 0, cssWidth, chartTop);
  ctx.fillRect(0, chartBottom, cssWidth, cssHeight - chartBottom);
  ctx.fillRect(0, 0, chartLeft, cssHeight);
  ctx.fillRect(chartRight, 0, cssWidth - chartRight, cssHeight);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
  ctx.strokeRect(chartLeft, chartTop, chartWidth, chartHeight);

  ctx.fillStyle = "rgba(240, 240, 245, 0.92)";
  ctx.font = "10px Tahoma, Segoe UI, sans-serif";

  if (!skipBuiltinHzGrid) {
    LABEL_FREQUENCIES.filter((frequency) => frequency <= maxFrequency).forEach((frequency) => {
      const ratio =
        (Math.log(frequency) - Math.log(MIN_FREQUENCY)) /
        Math.max(1e-9, Math.log(maxFrequency) - Math.log(MIN_FREQUENCY));
      const y = chartBottom - ratio * chartHeight;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.beginPath();
      ctx.moveTo(chartLeft, y + 0.5);
      ctx.lineTo(chartRight, y + 0.5);
      ctx.stroke();
      ctx.fillStyle = "rgba(240, 240, 245, 0.92)";
      ctx.fillText(formatFrequencyLabel(frequency), 8, y + 3);
    });
  }

  timeLabels.forEach((label, index) => {
    const ratio = timeLabels.length === 1 ? 0 : index / (timeLabels.length - 1);
    const x = chartLeft + ratio * chartWidth;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.beginPath();
    ctx.moveTo(x + 0.5, chartTop);
    ctx.lineTo(x + 0.5, chartBottom);
    ctx.stroke();
    ctx.fillStyle = "rgba(240, 240, 245, 0.92)";
    ctx.fillText(label, Math.max(0, x - 14), cssHeight - 6);
  });

  const legendWidth = Math.min(180, chartWidth);
  const legendHeight = 8;
  const legendX = chartRight - legendWidth;
  const legendY = cssHeight - 18;
  for (let pixelIndex = 0; pixelIndex < legendWidth; pixelIndex += 1) {
    ctx.fillStyle = dbToSpectrogramColor(pixelIndex / legendWidth);
    ctx.fillRect(legendX + pixelIndex, legendY, 1, legendHeight);
  }
  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.strokeRect(legendX, legendY, legendWidth, legendHeight);
  ctx.fillStyle = "rgba(240, 240, 245, 0.92)";
  ctx.fillText("-96 dBFS", legendX, legendY - 2);
  ctx.fillText("0 dBFS", legendX + legendWidth - 32, legendY - 2);
}

export function SpectrogramView({
  analyser,
  buffer,
  sampleRate,
  fftSize,
  maxFrequency,
  highlightFundamental = false,
  highlightOvertones = false,
  showNoteLabels = false,
}: SpectrogramViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastLiveColumnAtRef = useRef(0);
  const lastLiveWidthRef = useRef(0);
  const lastLiveHeightRef = useRef(0);
  const stft = useMemo(
    () => computeSTFT(buffer, sampleRate, {
      frameSize: fftSize,
      hopSize: Math.max(32, Math.floor(fftSize / 8)),
      windowFunction: "hann",
    }),
    [buffer, fftSize, sampleRate],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let animationFrameId = 0;
    let liveFrame = analyser ? new Float32Array(analyser.frequencyBinCount) : null;

    const renderBufferSpectrogram = () => {
      const resized = resizeCanvas(canvas);
      if (!resized) {
        return;
      }

      const { ctx, layout } = resized;
      ctx.clearRect(0, 0, layout.cssWidth, layout.cssHeight);
      ctx.fillStyle = "#0a0b14";
      ctx.fillRect(0, 0, layout.cssWidth, layout.cssHeight);

      if (!buffer || !stft.frameCount || !stft.binCount) {
        ctx.fillStyle = "#d0d3df";
        ctx.font = "10px Tahoma, Segoe UI, sans-serif";
        ctx.fillText("No spectrogram data", layout.chartLeft + 8, layout.chartTop + 14);
        drawOverlay(
          ctx,
          layout.cssWidth,
          layout.cssHeight,
          layout.chartLeft,
          layout.chartTop,
          layout.chartRight,
          layout.chartBottom,
          layout.chartWidth,
          layout.chartHeight,
          maxFrequency,
          ["0 s"],
          showNoteLabels,
        );
        if (highlightFundamental || highlightOvertones || showNoteLabels) {
          drawSpectrogramPitchOverlay(ctx, {
            chartLeft: layout.chartLeft,
            chartTop: layout.chartTop,
            chartRight: layout.chartRight,
            chartBottom: layout.chartBottom,
            chartWidth: layout.chartWidth,
            chartHeight: layout.chartHeight,
            maxFrequency,
            fundamentalHz: null,
            highlightFundamental,
            highlightOvertones,
            showNoteLabels,
            theme: "dark",
          });
        }
        return;
      }

      const rowCount = Math.min(192, layout.chartHeight);
      const bands = buildLogBands(rowCount, maxFrequency);
      const maxMagnitude = stft.magnitudes.reduce((peak, frame) => {
        const framePeak = Array.from(frame).reduce((frameMax, value) => Math.max(frameMax, value), 0);
        return Math.max(peak, framePeak);
      }, 0);
      const safeMaxMagnitude = Math.max(maxMagnitude, 1e-12);
      const minRenderableDb = -BUFFER_DYNAMIC_RANGE_DB;
      const rowHeight = layout.chartHeight / rowCount;

      for (let columnIndex = 0; columnIndex < layout.chartWidth; columnIndex += 1) {
        const frameIndex = Math.min(
          stft.frameCount - 1,
          Math.floor((columnIndex / Math.max(1, layout.chartWidth - 1)) * (stft.frameCount - 1)),
        );
        const frame = stft.magnitudes[frameIndex];
        for (let bandIndex = 0; bandIndex < bands.length; bandIndex += 1) {
          const band = bands[bandIndex];
          const magnitude = getFrameRangeMagnitude(frame, band.startFrequency, band.endFrequency, sampleRate, stft.frameSize);
          const relativeDb = magnitudeToDecibels(magnitude / safeMaxMagnitude, FALLBACK_MIN_DB);
          const normalized = clamp((relativeDb - minRenderableDb) / Math.abs(minRenderableDb), 0, 1);
          const y = layout.chartBottom - (bandIndex + 1) * rowHeight;
          ctx.fillStyle = dbToSpectrogramColor(Math.sqrt(normalized));
          ctx.fillRect(layout.chartLeft + columnIndex, y, 1, Math.max(1, rowHeight + 0.5));
        }
      }

      const durationSeconds = buffer.length / sampleRate;

      let fundamentalHz: number | null = null;
      if (highlightFundamental || highlightOvertones) {
        const frameIndex = pickLoudestStftFrameIndex(stft.magnitudes);
        const magFrame = stft.magnitudes[frameIndex];
        if (magFrame) {
          fundamentalHz = findDominantFrequencyLinearMagnitudes(
            magFrame,
            sampleRate,
            stft.frameSize,
            MIN_FREQUENCY,
            maxFrequency,
          );
        }
      }

      drawOverlay(
        ctx,
        layout.cssWidth,
        layout.cssHeight,
        layout.chartLeft,
        layout.chartTop,
        layout.chartRight,
        layout.chartBottom,
        layout.chartWidth,
        layout.chartHeight,
        maxFrequency,
        Array.from({ length: 5 }, (_, index) => formatTimeLabel((durationSeconds * index) / 4)),
        showNoteLabels,
      );

      if (highlightFundamental || highlightOvertones || showNoteLabels) {
        drawSpectrogramPitchOverlay(ctx, {
          chartLeft: layout.chartLeft,
          chartTop: layout.chartTop,
          chartRight: layout.chartRight,
          chartBottom: layout.chartBottom,
          chartWidth: layout.chartWidth,
          chartHeight: layout.chartHeight,
          maxFrequency,
          fundamentalHz,
          highlightFundamental,
          highlightOvertones,
          showNoteLabels,
          theme: "dark",
        });
      }
    };

    const renderLiveSpectrogram = () => {
      const resized = resizeCanvas(canvas);
      if (!resized || !analyser) {
        return;
      }

      const { ctx, layout } = resized;
      const shouldReset =
        layout.chartWidth !== lastLiveWidthRef.current ||
        layout.chartHeight !== lastLiveHeightRef.current;

      if (shouldReset) {
        ctx.clearRect(0, 0, layout.cssWidth, layout.cssHeight);
        ctx.fillStyle = "#0a0b14";
        ctx.fillRect(0, 0, layout.cssWidth, layout.cssHeight);
        lastLiveWidthRef.current = layout.chartWidth;
        lastLiveHeightRef.current = layout.chartHeight;
      }

      if (!liveFrame || liveFrame.length !== analyser.frequencyBinCount) {
        liveFrame = new Float32Array(analyser.frequencyBinCount);
      }

      const now = performance.now();
      if (shouldReset || now - lastLiveColumnAtRef.current >= LIVE_COLUMN_MS) {
        analyser.getFloatFrequencyData(liveFrame);
        ctx.drawImage(
          canvas,
          layout.chartLeft + 1,
          layout.chartTop,
          layout.chartWidth - 1,
          layout.chartHeight,
          layout.chartLeft,
          layout.chartTop,
          layout.chartWidth - 1,
          layout.chartHeight,
        );

        const rowCount = Math.min(192, layout.chartHeight);
        const bands = buildLogBands(rowCount, maxFrequency);
        const rowHeight = layout.chartHeight / rowCount;
        const minDb = Number.isFinite(analyser.minDecibels) ? analyser.minDecibels : FALLBACK_MIN_DB;
        const maxDb = Number.isFinite(analyser.maxDecibels) ? analyser.maxDecibels : FALLBACK_MAX_DB;
        const columnX = layout.chartRight - 1;

        for (let bandIndex = 0; bandIndex < bands.length; bandIndex += 1) {
          const band = bands[bandIndex];
          const normalized = getLiveRangeLevel(
            liveFrame,
            band.startFrequency,
            band.endFrequency,
            analyser.context.sampleRate,
            minDb,
            maxDb,
          );
          const y = layout.chartBottom - (bandIndex + 1) * rowHeight;
          ctx.fillStyle = dbToSpectrogramColor(Math.sqrt(normalized));
          ctx.fillRect(columnX, y, 1, Math.max(1, rowHeight + 0.5));
        }

        lastLiveColumnAtRef.current = now;
      }

      let fundamentalHz: number | null = null;
      if ((highlightFundamental || highlightOvertones) && liveFrame) {
        analyser.getFloatFrequencyData(liveFrame);
        fundamentalHz = findDominantFrequencyDecibels(
          liveFrame,
          analyser.context.sampleRate,
          MIN_FREQUENCY,
          maxFrequency,
        );
      }

      const liveHistorySeconds = (layout.chartWidth * LIVE_COLUMN_MS) / 1000;
      drawOverlay(
        ctx,
        layout.cssWidth,
        layout.cssHeight,
        layout.chartLeft,
        layout.chartTop,
        layout.chartRight,
        layout.chartBottom,
        layout.chartWidth,
        layout.chartHeight,
        maxFrequency,
        Array.from({ length: 5 }, (_, index) => {
          const seconds = liveHistorySeconds * (1 - index / 4);
          return index === 4 ? "now" : `-${formatTimeLabel(seconds)}`;
        }),
        showNoteLabels,
      );

      if (highlightFundamental || highlightOvertones || showNoteLabels) {
        drawSpectrogramPitchOverlay(ctx, {
          chartLeft: layout.chartLeft,
          chartTop: layout.chartTop,
          chartRight: layout.chartRight,
          chartBottom: layout.chartBottom,
          chartWidth: layout.chartWidth,
          chartHeight: layout.chartHeight,
          maxFrequency,
          fundamentalHz,
          highlightFundamental,
          highlightOvertones,
          showNoteLabels,
          theme: "dark",
        });
      }

      animationFrameId = window.requestAnimationFrame(renderLiveSpectrogram);
    };

    const observer = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          lastLiveWidthRef.current = 0;
          lastLiveHeightRef.current = 0;
          if (analyser) {
            renderLiveSpectrogram();
          } else {
            renderBufferSpectrogram();
          }
        })
      : null;

    observer?.observe(canvas);
    window.addEventListener("resize", renderBufferSpectrogram);
    if (analyser) {
      renderLiveSpectrogram();
    } else {
      renderBufferSpectrogram();
    }

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", renderBufferSpectrogram);
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [
    analyser,
    buffer,
    fftSize,
    highlightFundamental,
    highlightOvertones,
    maxFrequency,
    sampleRate,
    showNoteLabels,
    stft,
  ]);

  return <canvas ref={canvasRef} className="freq-analyzer-canvas freq-analyzer-spectrogram-canvas" />;
}
