import { describe, expect, it } from "vitest";
import {
  computeLegacyTransposeSemitones,
  normalizeParsedSncForInstrumentNotes,
  tryParseLegacyPitchToMidi,
} from "./legacySncPitch";
import { parseSncText } from "./sncParser";

describe("tryParseLegacyPitchToMidi", () => {
  it("matches tracker-style octave encoding from legacy SDK examples", () => {
    expect(tryParseLegacyPitchToMidi("3E")).toBe(64);
    expect(tryParseLegacyPitchToMidi("2A")).toBe(57);
    expect(tryParseLegacyPitchToMidi("1G")).toBe(43);
    expect(tryParseLegacyPitchToMidi("2D#")).toBe(51);
  });

  it("parses bare letter names as octave digit 3 (e.g. lambada.snc second-octave block)", () => {
    expect(tryParseLegacyPitchToMidi("B")).toBe(tryParseLegacyPitchToMidi("3B"));
    expect(tryParseLegacyPitchToMidi("C")).toBe(60);
    expect(tryParseLegacyPitchToMidi("F#")).toBe(66);
  });

  it("returns null for non-pitch tokens", () => {
    expect(tryParseLegacyPitchToMidi("note-0")).toBeNull();
    expect(tryParseLegacyPitchToMidi("Back")).toBeNull();
    expect(tryParseLegacyPitchToMidi("mi")).toBeNull();
  });
});

describe("computeLegacyTransposeSemitones", () => {
  it("aligns the lowest pitch to the keyboard base when the span fits", () => {
    expect(computeLegacyTransposeSemitones([43, 64], 24, 60)).toBe(17);
  });

  it("uses no transpose when every pitch already maps into the keyboard range", () => {
    expect(computeLegacyTransposeSemitones([64], 24, 60)).toBe(0);
  });
});

describe("normalizeParsedSncForInstrumentNotes", () => {
  it("rewrites a legacy pitch token to the matching note index (E4 → note-4)", () => {
    const parsed = parseSncText(`3E a -1`);
    const normalized = normalizeParsedSncForInstrumentNotes(parsed, 24);
    const names = normalized.commands
      .filter((c) => c.type === "alias")
      .map((c) => (c.type === "alias" ? c.name : ""));
    expect(names).toEqual(["note-4"]);
  });

  it("transposes so the lowest note maps into range when needed", () => {
    const parsed = parseSncText(`2B a -1`);
    const normalized = normalizeParsedSncForInstrumentNotes(parsed, 24);
    const names = normalized.commands
      .filter((c) => c.type === "alias")
      .map((c) => (c.type === "alias" ? c.name : ""));
    expect(names).toEqual(["note-0"]);
  });

  it("rewrites bare pitch names to note-*", () => {
    const parsed = parseSncText(`B a 0.7`);
    const normalized = normalizeParsedSncForInstrumentNotes(parsed, 24);
    const aliasCmd = normalized.commands.find((c) => c.type === "alias");
    expect(aliasCmd?.type === "alias" && aliasCmd.name.startsWith("note-")).toBe(true);
  });
});
