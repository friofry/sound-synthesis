import type { Track } from "@tonejs/midi";
import type { RenderSncFromTextOptions } from "../snc/renderSncFromText";

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Picks attack / release times for WAV render from MIDI note lengths so fast staccato
 * (e.g. game themes) is not dominated by fixed ~5 ms / ~14 ms envelopes.
 */
export function renderEnvelopeOptionsForMidiTrack(track: Track): RenderSncFromTextOptions {
  const durationsSec = track.notes.map((n) => n.duration).filter((d) => d > 1e-9);
  if (durationsSec.length === 0) {
    return {};
  }
  const sorted = [...durationsSec].sort((a, b) => a - b);
  /** ~5th percentile duration so one glitch note does not define the whole score. */
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * 0.05)));
  const refSec = sorted[idx]!;
  const refMs = refSec * 1000;

  const noteAttackMs = clamp(refMs * 0.18, 0.8, 6);
  const releaseFadeMs = clamp(refMs * 0.28, 1.5, 14);

  return { noteAttackMs, releaseFadeMs };
}
