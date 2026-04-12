import type { Midi } from "@tonejs/midi";

export type MidiTrackListEntry = {
  trackIndex: number;
  label: string;
  noteCount: number;
};

function formatTrackLabel(trackName: string | undefined, trackIndex: number): string {
  const trimmed = trackName?.trim() ?? "";
  if (trimmed.length > 0) {
    return trimmed;
  }
  return `Track ${trackIndex + 1}`;
}

/**
 * Lists MIDI tracks that contain at least one note, for part selection.
 */
export function listMidiTracksWithNotes(midi: Midi): MidiTrackListEntry[] {
  const out: MidiTrackListEntry[] = [];
  for (let trackIndex = 0; trackIndex < midi.tracks.length; trackIndex += 1) {
    const track = midi.tracks[trackIndex];
    const noteCount = track.notes.length;
    if (noteCount === 0) {
      continue;
    }
    out.push({
      trackIndex,
      label: formatTrackLabel(track.name, trackIndex),
      noteCount,
    });
  }
  return out;
}
