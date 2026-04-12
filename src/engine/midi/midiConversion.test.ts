import { describe, expect, it } from "vitest";
import { Midi } from "@tonejs/midi";
import { listMidiTracksWithNotes } from "./listMidiParts";
import { midiTrackToSnc } from "./midiTrackToSnc";
import { sncTextToMidiBytes } from "./sncToMidi";
import type { RawInstrumentNote } from "../types";
import { BASE_MIDI_FOR_NOTE0 } from "./constants";

function mockInstrumentNotes(count: number): RawInstrumentNote[] {
  return Array.from({ length: count }, (_, index) => ({
    alias: `note-${index}`,
    keyLabel: String(index),
    keyCode: "KeyQ",
    index,
    frequency: 440,
    sampleRate: 48_000,
    buffer: new Float32Array(16),
  }));
}

describe("listMidiTracksWithNotes", () => {
  it("skips empty tracks", () => {
    const midi = new Midi();
    midi.addTrack();
    const t = midi.addTrack();
    t.addNote({ midi: 60, time: 0, duration: 0.1, velocity: 0.8 });
    const parts = listMidiTracksWithNotes(midi);
    expect(parts).toHaveLength(1);
    expect(parts[0]?.trackIndex).toBe(1);
  });
});

describe("midiTrackToSnc", () => {
  it("emits SNC with note aliases for a simple track", () => {
    const midi = new Midi();
    midi.header.setTempo(120);
    const track = midi.addTrack();
    track.addNote({ midi: BASE_MIDI_FOR_NOTE0, time: 0, duration: 0.25, velocity: 0.8 });
    const snc = midiTrackToSnc(track, 24);
    expect(snc).toContain("note-0");
    expect(snc).toContain("a -1");
    expect(snc).toContain("r 0");
    expect(snc).toContain("!wait");
  });

  it("transposes out-of-range MIDI into the instrument range", () => {
    const midi = new Midi();
    const track = midi.addTrack();
    track.addNote({ midi: 84, time: 0, duration: 0.1, velocity: 0.8 });
    track.addNote({ midi: 86, time: 0.2, duration: 0.1, velocity: 0.8 });
    const snc = midiTrackToSnc(track, 12);
    expect(snc).toMatch(/note-(0|1|2|3|4|5|6|7|8|9|10|11) a -1/);
    expect(snc).not.toContain("note-12");
  });
});

describe("sncTextToMidiBytes", () => {
  it("exports a playable MIDI buffer from simple SNC", () => {
    const notes = mockInstrumentNotes(24);
    const snc = "note-0 a 0.5";
    const bytes = sncTextToMidiBytes(snc, notes);
    const roundTrip = new Midi(bytes);
    expect(roundTrip.tracks.length).toBeGreaterThan(0);
    expect(roundTrip.tracks[0]?.notes.length).toBeGreaterThan(0);
    const n0 = roundTrip.tracks[0]?.notes[0];
    expect(n0?.midi).toBe(BASE_MIDI_FOR_NOTE0);
  });
});
