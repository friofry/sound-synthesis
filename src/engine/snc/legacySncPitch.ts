import type { SncCommand, SncParseResult } from "./types";

/** MIDI note for C4 (used as `note-0` when baseMidiForNote0 is 60). */
const DEFAULT_BASE_MIDI = 60;

const NOTE_CLASS: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/** Chromatic solfege (Russian-style names as in legacy SDK/test.snc). */
const SOLFEGE_TO_SEMITONE = new Map<string, number>([
  ["do", 0],
  ["do#", 1],
  ["re", 2],
  ["re#", 3],
  ["mi", 4],
  ["fa", 5],
  ["fa#", 6],
  ["sol", 7],
  ["sol#", 8],
  ["lya", 9],
  ["lya#", 10],
  ["si", 11],
]);

/**
 * Legacy `.snc` pitch token: optional octave digit (0–8) + diatonic letter + optional #/b.
 * With digit: MIDI = (octaveDigit + 2) * 12 + chromaticClass (tracker-style, see SDK).
 * Without digit (e.g. `lambada.snc`): letter names in the "second octave" block map to
 * the same encoding as octave digit 3 — e.g. bare `B` ≡ `3B` (matches alias Hz in those files).
 */
const LEGACY_PITCH_PREFIXED = /^([0-8])([A-Ga-g])(#|b|♭)?$/;
const LEGACY_PITCH_BARE = /^([A-Ga-g])(#|b|♭)?$/;

const BARE_NOTE_DEFAULT_OCTAVE_DIGIT = 3;

function midiFromOctaveDigitAndLetter(octDigit: number, letter: string, acc: string | undefined): number | null {
  const upper = letter.toUpperCase();
  const base = NOTE_CLASS[upper];
  if (base === undefined) {
    return null;
  }
  let noteClass = base;
  if (acc === "#") {
    noteClass += 1;
  } else if (acc === "b" || acc === "♭") {
    noteClass -= 1;
  }
  return (octDigit + 2) * 12 + noteClass;
}

export function tryParseLegacyPitchToMidi(token: string): number | null {
  const t = token.trim();
  const prefixed = LEGACY_PITCH_PREFIXED.exec(t);
  if (prefixed) {
    return midiFromOctaveDigitAndLetter(Number(prefixed[1]), prefixed[2], prefixed[3]);
  }
  const bare = LEGACY_PITCH_BARE.exec(t);
  if (bare) {
    return midiFromOctaveDigitAndLetter(BARE_NOTE_DEFAULT_OCTAVE_DIGIT, bare[1], bare[2]);
  }
  return null;
}

function trySolfegeToIndex(name: string): number | null {
  const key = name.toLowerCase();
  if (!SOLFEGE_TO_SEMITONE.has(key)) {
    return null;
  }
  return SOLFEGE_TO_SEMITONE.get(key)!;
}

function collectLegacyMidisFromCommands(commands: SncCommand[]): number[] {
  const out: number[] = [];
  for (const command of commands) {
    if (command.type !== "alias") {
      continue;
    }
    const midi = tryParseLegacyPitchToMidi(command.name);
    if (midi !== null) {
      out.push(midi);
    }
  }
  return out;
}

/**
 * Picks a global transpose (in semitones) so that legacy pitch lines map into
 * [0, noteCount), anchored so the lowest note maps to `baseMidiForNote0` when possible.
 */
export function computeLegacyTransposeSemitones(
  legacyMidis: number[],
  noteCount: number,
  baseMidiForNote0 = DEFAULT_BASE_MIDI,
): number {
  if (legacyMidis.length === 0 || noteCount <= 0) {
    return 0;
  }
  const min = Math.min(...legacyMidis);
  const max = Math.max(...legacyMidis);
  const top = baseMidiForNote0 + noteCount - 1;
  if (min >= baseMidiForNote0 && max <= top) {
    return 0;
  }
  const alignBottom = baseMidiForNote0 - min;
  if (alignBottom >= 0 && max + alignBottom <= top) {
    return alignBottom;
  }
  const alignTop = top - max;
  if (min + alignTop >= baseMidiForNote0) {
    return alignTop;
  }
  return alignBottom;
}

function midiToNoteIndex(midi: number, transpose: number, noteCount: number, baseMidiForNote0: number): number {
  const idx = midi + transpose - baseMidiForNote0;
  if (noteCount <= 1) {
    return 0;
  }
  return Math.max(0, Math.min(noteCount - 1, Math.round(idx)));
}

function resolveAliasName(
  raw: string,
  transpose: number,
  noteCount: number,
  baseMidiForNote0: number,
): string | null {
  const trimmed = raw.trim();
  const noteMatch = /^note-(\d+)$/.exec(trimmed);
  if (noteMatch) {
    return trimmed;
  }
  const midi = tryParseLegacyPitchToMidi(trimmed);
  if (midi !== null) {
    const index = midiToNoteIndex(midi, transpose, noteCount, baseMidiForNote0);
    return `note-${index}`;
  }
  const sol = trySolfegeToIndex(trimmed);
  if (sol !== null) {
    const index = Math.min(noteCount - 1, sol);
    return `note-${index}`;
  }
  return null;
}

/**
 * Rewrites legacy pitch aliases (`3E`, `2D#`, …) and one-octave solfege names
 * into `note-{i}` so playback uses the generated instrument buffers.
 */
export function normalizeParsedSncForInstrumentNotes(
  parsed: SncParseResult,
  noteCount: number,
  baseMidiForNote0 = DEFAULT_BASE_MIDI,
): SncParseResult {
  if (noteCount <= 0) {
    return parsed;
  }

  const legacyMidis = collectLegacyMidisFromCommands(parsed.commands);
  const transpose = computeLegacyTransposeSemitones(legacyMidis, noteCount, baseMidiForNote0);

  const commands: SncCommand[] = parsed.commands.map((command) => {
    if (command.type !== "alias") {
      return command;
    }
    const mapped = resolveAliasName(command.name, transpose, noteCount, baseMidiForNote0);
    if (mapped === null || mapped === command.name) {
      return command;
    }
    return { ...command, name: mapped };
  });

  return {
    aliases: parsed.aliases,
    commands,
  };
}
