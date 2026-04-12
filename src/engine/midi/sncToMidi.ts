import { Midi } from "@tonejs/midi";
import { buildSncPlaybackIntervals } from "../snc/sncPlaybackKeys";
import type { RawInstrumentNote } from "../types";
import { BASE_MIDI_FOR_NOTE0 } from "./constants";

export type SncTextToMidiBytesOptions = {
  monophonicLead?: boolean;
};

/**
 * Encodes the current SNC melody as a single-track Type-0 style `.mid` buffer.
 * Uses absolute seconds from the SNC interpreter (same as WAV render / key simulation).
 */
export function sncTextToMidiBytes(
  sncText: string,
  instrumentNotes: RawInstrumentNote[],
  options?: SncTextToMidiBytesOptions,
): Uint8Array {
  if (instrumentNotes.length === 0) {
    throw new Error("No instrument notes loaded");
  }
  if (!sncText.trim()) {
    throw new Error("No melody to export");
  }

  const intervals = buildSncPlaybackIntervals(sncText, instrumentNotes, {
    monophonicLead: options?.monophonicLead ?? true,
  });
  const midi = new Midi();
  midi.header.setTempo(120);
  const track = midi.addTrack();
  track.name = "Melody";

  const sorted = [...intervals].sort((a, b) => {
    if (a.startSec !== b.startSec) {
      return a.startSec - b.startSec;
    }
    return a.index - b.index;
  });

  for (const iv of sorted) {
    const dur = iv.endSec - iv.startSec;
    if (!(dur > 0)) {
      continue;
    }
    const midiNote = BASE_MIDI_FOR_NOTE0 + iv.index;
    track.addNote({
      midi: midiNote,
      time: iv.startSec,
      duration: dur,
      velocity: 0.85,
    });
  }

  return midi.toArray();
}
