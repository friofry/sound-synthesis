import type { Track } from "@tonejs/midi";
import { computeLegacyTransposeSemitones } from "../snc/legacySncPitch";
import { BASE_MIDI_FOR_NOTE0 } from "./constants";

type EdgeKind = "on" | "off";

type TimeEdge = {
  t: number;
  kind: EdgeKind;
  index: number;
};

function midiToNoteIndex(midi: number, transpose: number, noteCount: number, baseMidi: number): number {
  const idx = midi + transpose - baseMidi;
  if (noteCount <= 1) {
    return 0;
  }
  return Math.max(0, Math.min(noteCount - 1, Math.round(idx)));
}

/**
 * Converts a MIDI track into `.snc` text using sustain (`a -1`) / release (`r`) events.
 * Applies a global transpose so all notes fit `[0, noteCount)` (same strategy as legacy SNC).
 */
export function midiTrackToSnc(track: Track, noteCount: number): string {
  if (noteCount <= 0) {
    throw new Error("Instrument must have at least one note");
  }
  const notes = track.notes.filter((n) => n.duration > 1e-9);
  if (notes.length === 0) {
    throw new Error("Selected MIDI track has no notes");
  }

  const midis = notes.map((n) => n.midi);
  const transpose = computeLegacyTransposeSemitones(midis, noteCount, BASE_MIDI_FOR_NOTE0);

  const edges: TimeEdge[] = [];
  for (const n of notes) {
    const index = midiToNoteIndex(n.midi, transpose, noteCount, BASE_MIDI_FOR_NOTE0);
    const start = n.time;
    const end = n.time + n.duration;
    edges.push({ t: start, kind: "on", index });
    edges.push({ t: end, kind: "off", index });
  }

  edges.sort((a, b) => {
    if (a.t !== b.t) {
      return a.t - b.t;
    }
    /** Prefer note-off before note-on at the same timestamp (clean re-attacks). */
    if (a.kind !== b.kind) {
      return a.kind === "off" ? -1 : 1;
    }
    if (a.index !== b.index) {
      return a.index - b.index;
    }
    return 0;
  });

  const lines: string[] = [];
  let t = 0;
  for (const e of edges) {
    const dt = e.t - t;
    if (dt > 0) {
      lines.push(`!wait ${formatSeconds(dt)}`);
    } else if (dt < 0) {
      throw new Error("Invalid MIDI timing: events must be non-decreasing");
    }
    t = e.t;
    if (e.kind === "on") {
      lines.push(`note-${e.index} a -1`);
    } else {
      lines.push(`note-${e.index} r 0`);
    }
  }

  lines.push("-- end", "!wait 0.5");
  return lines.join("\n");
}

function formatSeconds(seconds: number): string {
  const s = Math.max(0, seconds);
  const rounded = Math.round(s * 1_000_000) / 1_000_000;
  let text = rounded.toFixed(6);
  text = text.replace(/\.?0+$/, "");
  return text.length > 0 ? text : "0";
}
