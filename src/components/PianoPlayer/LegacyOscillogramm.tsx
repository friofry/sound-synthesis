import { LegacyOscillogrammSpectrum } from "./LegacyOscillogrammSpectrum";
import { LegacyOscillogrammWaveform } from "./LegacyOscillogrammWaveform";

type LegacyOscillogrammProps = {
  buffer: Float32Array | null;
  sampleRate: number;
  analyser: AnalyserNode | null;
  fallbackSpectrumBuffer?: Float32Array | null;
  compact?: boolean;
};

export function LegacyOscillogramm({
  buffer,
  sampleRate,
  analyser,
  fallbackSpectrumBuffer,
  compact = false,
}: LegacyOscillogrammProps) {
  const fallbackBuffer = fallbackSpectrumBuffer ?? buffer;
  return (
    <div className={`legacy-oscillogramm${compact ? " compact" : ""}`}>
      <LegacyOscillogrammWaveform buffer={buffer} sampleRate={sampleRate} compact={compact} />
      <LegacyOscillogrammSpectrum analyser={analyser} sampleRate={sampleRate} buffer={fallbackBuffer} compact={compact} />
    </div>
  );
}
