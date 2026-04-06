import { useCallback, useEffect, useMemo, useRef, type CSSProperties, type MouseEventHandler } from "react";

const TICK_COUNT = 50;
const WAVEFORM_HEIGHT = 82;
const SPECTRUM_HEIGHT = 95;

type LegacyOscillogrammProps = {
  buffer: Float32Array | null;
  sampleRate: number;
  analyser: AnalyserNode | null;
  fallbackSpectrumBuffer?: Float32Array | null;
  fallbackSpectrumSampleRate?: number;
  compact?: boolean;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function buildFallbackSpectrum(buffer: Float32Array | null, _sampleRate: number): number[] {
  if (!buffer || buffer.length < 64) {
    return [];
  }

  const size = Math.min(1024, buffer.length);
  const binCount = 64;
  const output: number[] = [];

  for (let bin = 1; bin <= binCount; bin += 1) {
    let real = 0;
    let imag = 0;
    for (let n = 0; n < size; n += 1) {
      const angle = (2 * Math.PI * bin * n) / size;
      real += buffer[n] * Math.cos(angle);
      imag -= buffer[n] * Math.sin(angle);
    }
    output.push(Math.sqrt(real * real + imag * imag) / size);
  }

  const max = output.reduce((value, item) => Math.max(value, item), 0) || 1;
  return output.map((item) => item / max);
}

export function LegacyOscillogramm({
  buffer,
  sampleRate,
  analyser,
  fallbackSpectrumBuffer,
  fallbackSpectrumSampleRate,
  compact = false,
}: LegacyOscillogrammProps) {
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const spectrumCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const positionRef = useRef(0);
  const shagRef = useRef(1);
  const lastBufferRef = useRef<Float32Array | null>(null);
  const lastLiveSpectrumAtRef = useRef(0);

  const fallbackSpectrumData = fallbackSpectrumBuffer ?? buffer;
  const fallbackSpectrumRate = fallbackSpectrumSampleRate ?? sampleRate;
  const fallbackSpectrum = useMemo(
    () => buildFallbackSpectrum(fallbackSpectrumData, fallbackSpectrumRate),
    [fallbackSpectrumData, fallbackSpectrumRate],
  );

  const maxPosition = useMemo(() => {
    if (!buffer || buffer.length === 0) {
      return 0;
    }
    return buffer.length - 1;
  }, [buffer]);

  const redrawWaveform = useCallback(() => {
    const canvas = waveformCanvasRef.current;
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

    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY + 0.5);
    ctx.lineTo(cssWidth, centerY + 0.5);
    ctx.stroke();

    ctx.font = "12px Arial, Tahoma, Segoe UI, sans-serif";
    ctx.fillStyle = "#000";

    for (let tick = 1; tick < TICK_COUNT; tick += 1) {
      const x = Math.floor((tick * cssWidth) / TICK_COUNT);
      ctx.beginPath();
      ctx.moveTo(x + 0.5, centerY - 3);
      ctx.lineTo(x + 0.5, centerY + 4);
      ctx.stroke();

      const sampleAtTick = (positionRef.current + x) * shagRef.current;
      const msAtTick = Math.floor((sampleAtTick * 1000) / sampleRate);
      const tickSpan = Math.floor(cssWidth / TICK_COUNT) * shagRef.current + 1;
      const samplePerMs = Math.max(1, Math.floor(sampleRate / 1000));
      const alignedToMs = sampleAtTick % samplePerMs < tickSpan;
      if (msAtTick > 0 && alignedToMs && shagRef.current === 1) {
        ctx.fillText(String(msAtTick), x - 12, centerY + 16);
      }
    }

    if (!buffer || buffer.length === 0) {
      ctx.fillStyle = "#666";
      ctx.fillText("No active note buffer", 8, 14);
      return;
    }

    const start = positionRef.current;
    const step = shagRef.current;
    const minVisible = Math.min(cssWidth, Math.floor((buffer.length - start) / step));
    const scaleY = cssHeight / 2;

    ctx.strokeStyle = "#ff2a2a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY - (buffer[start] ?? 0) * scaleY);

    let sampleOffset = step;
    for (let x = 1; x < minVisible; x += 1) {
      const sample = buffer[start + sampleOffset] ?? 0;
      ctx.lineTo(x, centerY - sample * scaleY);
      sampleOffset += step;
    }
    ctx.stroke();

    // Legacy-like red cursor at the current viewport end.
    const tailX = Math.min(cssWidth - 1.5, Math.max(0.5, minVisible - 0.5));
    ctx.beginPath();
    ctx.moveTo(tailX, 0);
    ctx.lineTo(tailX, cssHeight);
    ctx.stroke();
  }, [buffer, sampleRate]);

  useEffect(() => {
    redrawWaveform();
  }, [redrawWaveform]);

  useEffect(() => {
    positionRef.current = clamp(positionRef.current, 0, maxPosition);
    redrawWaveform();
  }, [maxPosition, redrawWaveform]);

  useEffect(() => {
    if (lastBufferRef.current !== buffer) {
      positionRef.current = 0;
      shagRef.current = 1;
      lastBufferRef.current = buffer;
      redrawWaveform();
    }
  }, [buffer, redrawWaveform]);

  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas) {
      return;
    }
    const handleResize = () => redrawWaveform();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(handleResize) : null;
    observer?.observe(canvas);
    window.addEventListener("resize", handleResize);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [redrawWaveform]);

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
  }, [analyser, fallbackSpectrum]);

  const nudgeLeft = () => {
    const canvas = waveformCanvasRef.current;
    const width = Math.max(1, Math.floor(canvas?.getBoundingClientRect().width ?? 0));
    positionRef.current = Math.max(0, positionRef.current - width * shagRef.current);
    redrawWaveform();
  };

  const nudgeRight = () => {
    const canvas = waveformCanvasRef.current;
    const width = Math.max(1, Math.floor(canvas?.getBoundingClientRect().width ?? 0));
    positionRef.current = Math.min(maxPosition, positionRef.current + width * shagRef.current);
    redrawWaveform();
  };

  const zoomOut = () => {
    shagRef.current <<= 1;
    redrawWaveform();
  };

  const zoomIn = () => {
    shagRef.current >>= 1;
    if (shagRef.current < 1) {
      shagRef.current = 1;
    }
    redrawWaveform();
  };

  const handleWaveformContextMenu: MouseEventHandler<HTMLCanvasElement> = (event) => {
    event.preventDefault();
    const mode = window.prompt("Go to position mode: enter 'ms' or 'sample'", "ms");
    if (!mode) {
      return;
    }
    const valueText = window.prompt("Enter target value", "0");
    if (!valueText) {
      return;
    }
    const value = Number(valueText);
    if (!Number.isFinite(value) || value < 0) {
      return;
    }
    if (mode.toLowerCase().startsWith("m")) {
      positionRef.current = Math.floor((value * sampleRate) / 1000);
    } else {
      positionRef.current = Math.floor(value);
    }
    positionRef.current = clamp(positionRef.current, 0, maxPosition);
    redrawWaveform();
  };

  return (
    <div className={`legacy-oscillogramm${compact ? " compact" : ""}`}>
      {!compact && (
        <div className="oscillogram-toolbar">
          <button type="button" className="osc-btn osc-icon-btn" onClick={nudgeLeft} title="Scroll left">
            <span className="toolbar-sprite bitmap5-sprite" style={{ "--sprite-index": 0 } as CSSProperties} aria-hidden />
            <span className="sr-only">Scroll left</span>
          </button>
          <button type="button" className="osc-btn osc-icon-btn" onClick={nudgeRight} title="Scroll right">
            <span className="toolbar-sprite bitmap5-sprite" style={{ "--sprite-index": 1 } as CSSProperties} aria-hidden />
            <span className="sr-only">Scroll right</span>
          </button>
          <button type="button" className="osc-btn osc-icon-btn" onClick={zoomIn} title="Zoom in (x1)">
            <span className="toolbar-sprite bitmap5-sprite" style={{ "--sprite-index": 3 } as CSSProperties} aria-hidden />
            <span className="sr-only">Zoom in</span>
          </button>
          <button type="button" className="osc-btn osc-icon-btn" onClick={zoomOut} title="Zoom out (x2)">
            <span className="toolbar-sprite bitmap5-sprite" style={{ "--sprite-index": 2 } as CSSProperties} aria-hidden />
            <span className="sr-only">Zoom out</span>
          </button>
        </div>
      )}
      <canvas
        ref={waveformCanvasRef}
        className="legacy-oscillogramm-waveform"
        onContextMenu={handleWaveformContextMenu}
        style={{ height: compact ? "50%" : WAVEFORM_HEIGHT }}
      />
      <canvas
        ref={spectrumCanvasRef}
        className="legacy-oscillogramm-spectrum"
        style={{ height: compact ? "50%" : SPECTRUM_HEIGHT }}
      />
    </div>
  );
}
