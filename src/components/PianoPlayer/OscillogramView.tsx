import { useCallback, useEffect, useMemo, useRef } from "react";
import { OscillogramToolbar } from "./OscillogramToolbar";

const TICK_COUNT = 50;
const VIEW_HEIGHT = 82;
const MIN_AUTO_PEAK = 1e-3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getNiceSampleStep(rawStep: number): number {
  if (!Number.isFinite(rawStep) || rawStep <= 0) {
    return 1;
  }

  const power = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / power;

  if (normalized <= 1) {
    return 1 * power;
  }
  if (normalized <= 2) {
    return 2 * power;
  }
  if (normalized <= 5) {
    return 5 * power;
  }
  return 10 * power;
}

type OscillogramViewProps = {
  buffer: Float32Array | null;
  sampleRate: number;
  compact?: boolean;
};

export function OscillogramView({ buffer, sampleRate, compact = false }: OscillogramViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const positionRef = useRef(0);
  const shagRef = useRef(1);
  const lastBufferRef = useRef<Float32Array | null>(null);

  const sampleCount = buffer?.length ?? 0;

  const maxPosition = useMemo(() => {
    if (!buffer || buffer.length === 0) {
      return 0;
    }
    return buffer.length - 1;
  }, [buffer]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = Math.max(1, Math.floor(rect.width));
    const cssHeight = Math.max(1, Math.floor(rect.height));

    if (canvas.width !== Math.floor(cssWidth * dpr) || canvas.height !== Math.floor(cssHeight * dpr)) {
      canvas.width = Math.floor(cssWidth * dpr);
      canvas.height = Math.floor(cssHeight * dpr);
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    const centerY = Math.floor(cssHeight / 2);
    const topY = Math.max(1, Math.floor(cssHeight * 0.08));
    const bottomY = Math.min(cssHeight - 1, Math.floor(cssHeight * 0.92));
    const waveHalfHeight = Math.max(1, Math.floor((bottomY - topY) / 2));

    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY + 0.5);
    ctx.lineTo(cssWidth, centerY + 0.5);
    ctx.stroke();

    ctx.font = "10px Tahoma, Segoe UI, sans-serif";
    ctx.fillStyle = "#000000";

    // Normalized Y scale: keep waveform readable regardless of absolute amplitude.
    const start = positionRef.current;
    const step = shagRef.current;
    let visiblePeak = 0;

    if (buffer && buffer.length > 0) {
      for (let x = 0; x < cssWidth; x += 1) {
        const sampleIndex = start + x * step;
        if (sampleIndex >= buffer.length) {
          break;
        }
        const sample = Math.abs(buffer[sampleIndex] ?? 0);
        if (sample > visiblePeak) {
          visiblePeak = sample;
        }
      }
    }

    const amplitudeScale = Math.max(visiblePeak, MIN_AUTO_PEAK);

    ctx.strokeStyle = "#b0b0b0";
    ctx.beginPath();
    ctx.moveTo(0, topY + 0.5);
    ctx.lineTo(cssWidth, topY + 0.5);
    ctx.moveTo(0, bottomY + 0.5);
    ctx.lineTo(cssWidth, bottomY + 0.5);
    ctx.stroke();
    ctx.fillText("+1.0", 4, topY - 2);
    ctx.fillText("-1.0", 4, bottomY - 2);

    ctx.strokeStyle = "#000000";
    for (let tick = 1; tick < TICK_COUNT; tick += 1) {
      const x = Math.floor((tick * cssWidth) / TICK_COUNT);
      ctx.beginPath();
      ctx.moveTo(x + 0.5, centerY - 3);
      ctx.lineTo(x + 0.5, centerY + 4);
      ctx.stroke();
    }

    const visibleSamples = cssWidth * step;
    const targetMajorTickCount = Math.max(2, Math.floor(cssWidth / 70));
    const rawSampleStep = visibleSamples / targetMajorTickCount;
    const majorStep = Math.max(1, Math.round(getNiceSampleStep(rawSampleStep)));
    const firstMajorSample = Math.ceil(start / majorStep) * majorStep;
    const lastVisibleSample = start + visibleSamples;

    for (let sampleValue = firstMajorSample; sampleValue <= lastVisibleSample; sampleValue += majorStep) {
      const x = (sampleValue - start) / step;
      if (x < 0 || x > cssWidth) {
        continue;
      }
      const px = Math.round(x) + 0.5;
      ctx.beginPath();
      ctx.moveTo(px, centerY - 5);
      ctx.lineTo(px, centerY + 6);
      ctx.stroke();
      ctx.fillText(`${sampleValue}`, Math.max(0, Math.round(x) - 12), centerY + 16);
    }

    if (!buffer || buffer.length === 0) {
      ctx.fillStyle = "#666";
      ctx.fillText("No active note buffer", 8, 14);
      return;
    }

    ctx.strokeStyle = "#ff0000";
    ctx.lineWidth = 1;
    ctx.beginPath();

    const firstSample = buffer[start] ?? 0;
    ctx.moveTo(0, centerY - (firstSample / amplitudeScale) * waveHalfHeight);

    for (let x = 1; x < cssWidth; x += 1) {
      const sampleIndex = start + x * step;
      if (sampleIndex >= buffer.length) {
        break;
      }
      const sample = buffer[sampleIndex] ?? 0;
      const y = centerY - (sample / amplitudeScale) * waveHalfHeight;
      ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cssWidth - 1.5, 0);
    ctx.lineTo(cssWidth - 1.5, cssHeight);
    ctx.stroke();

    ctx.fillStyle = "#000000";
    const startMs = ((positionRef.current * 1000) / sampleRate).toFixed(1);
    const windowMs = ((cssWidth * shagRef.current * 1000) / sampleRate).toFixed(1);
    ctx.fillText(
      `start: ${startMs} ms, window: ${windowMs} ms, zoom step: ${shagRef.current}, norm +/-${amplitudeScale.toFixed(3)}`,
      8,
      14,
    );
  }, [buffer, sampleRate]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  useEffect(() => {
    positionRef.current = clamp(positionRef.current, 0, maxPosition);
    redraw();
  }, [buffer, maxPosition, redraw]);

  useEffect(() => {
    if (lastBufferRef.current !== buffer) {
      // A new note buffer should always open from the beginning at x1 zoom.
      positionRef.current = 0;
      shagRef.current = 1;
      lastBufferRef.current = buffer;
      redraw();
    }
  }, [buffer, redraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const handleResize = () => {
      redraw();
    };

    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(handleResize) : null;
    observer?.observe(canvas);
    window.addEventListener("resize", handleResize);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [redraw]);

  const nudgeLeft = () => {
    const canvas = canvasRef.current;
    const width = Math.max(1, Math.floor(canvas?.getBoundingClientRect().width ?? 0));
    positionRef.current = Math.max(0, positionRef.current - width * shagRef.current);
    redraw();
  };

  const nudgeRight = () => {
    const canvas = canvasRef.current;
    const width = Math.max(1, Math.floor(canvas?.getBoundingClientRect().width ?? 0));
    positionRef.current = Math.min(maxPosition, positionRef.current + width * shagRef.current);
    redraw();
  };

  const zoomOut = () => {
    shagRef.current <<= 1;
    redraw();
  };

  const zoomIn = () => {
    shagRef.current >>= 1;
    if (shagRef.current < 1) {
      shagRef.current = 1;
    }
    redraw();
  };

  return (
    <div className={`oscillogram-container${compact ? " compact" : ""}`}>
      {!compact && (
        <OscillogramToolbar onNudgeLeft={nudgeLeft} onNudgeRight={nudgeRight} onZoomIn={zoomIn} onZoomOut={zoomOut} />
      )}
      <canvas ref={canvasRef} className="oscillogram-canvas" style={{ height: compact ? "100%" : VIEW_HEIGHT }} />
      {!compact && (
        <div className="oscillogram-meta">
          duration: {((sampleCount * 1000) / sampleRate).toFixed(1)} ms ({sampleCount} samples)
        </div>
      )}
    </div>
  );
}
