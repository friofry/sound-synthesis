import { floatToInt16Pcm } from "./pcm";
import { normalizeParsedSncForInstrumentNotes } from "./legacySncPitch";
import { executeSncCommands, parseSncText } from "./sncParser";
import { SimpleMixer } from "./simpleMixer";
import { MixMode } from "./types";
import { encodeWavBlob } from "./wavExport";
import type { RawInstrumentNote } from "../types";

const DEFAULT_NOTE_ATTACK_MS = 5;

function concatInt16Arrays(chunks: Int16Array[]): Int16Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Int16Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export type RenderSncFromTextResult = {
  wavBlob: Blob;
  pcm: Int16Array;
  sampleRate: number;
};

export type RenderSncFromTextOptions = {
  /** Fade-in at note on when mixing to WAV (default ~5 ms). Set to 0 to disable. */
  noteAttackMs?: number;
  /** Passed through to `executeSncCommands` (note-off fade). */
  releaseFadeMs?: number;
};

/**
 * Renders `.snc` text into a stereo WAV using the given instrument note buffers.
 * Applies legacy pitch-name normalization when needed.
 */
export function renderSncTextToWav(
  text: string,
  instrumentNotes: RawInstrumentNote[],
  options?: RenderSncFromTextOptions,
): RenderSncFromTextResult {
  if (instrumentNotes.length === 0) {
    throw new Error("No instrument notes loaded");
  }

  const parsedRaw = parseSncText(text);
  const parsed = normalizeParsedSncForInstrumentNotes(parsedRaw, instrumentNotes.length);

  const noteMap = new Map(instrumentNotes.map((note) => [note.alias, note]));
  const chunks: Int16Array[] = [];
  const sampleRate = instrumentNotes[0]?.sampleRate ?? 48_000;
  const noteAttackMs = options?.noteAttackMs ?? DEFAULT_NOTE_ATTACK_MS;
  /** Regulation avoids hard int16 clipping when several sustained notes overlap (e.g. polyphonic MIDI). */
  const mixer = new SimpleMixer(MixMode.Regulation);

  executeSncCommands(
    parsed.commands,
    mixer,
    {
      sampleRate,
      knownAliases: noteMap.keys(),
      releaseFadeMs: options?.releaseFadeMs,
      noteAttackMs,
      createStreamForAlias: (alias) => {
        const note = noteMap.get(alias);
        if (!note) {
          throw new Error(`Unknown alias '${alias}'`);
        }
        const pcm = floatToInt16Pcm(note.buffer);
        let offset = 0;
        return {
          getSamples(durationSeconds: number) {
            const sampleCount = Math.max(0, Math.round(durationSeconds * sampleRate));
            const chunk = new Int16Array(sampleCount);
            const available = Math.max(0, Math.min(sampleCount, pcm.length - offset));
            if (available > 0) {
              chunk.set(pcm.subarray(offset, offset + available));
              offset += available;
            }
            return chunk;
          },
          reset() {
            offset = 0;
          },
        };
      },
    },
    (chunk) => {
      chunks.push(chunk);
    },
  );

  if (mixer.size > 0) {
    chunks.push(mixer.getBuffer());
  }

  const merged = concatInt16Arrays(chunks);
  const wavBlob = encodeWavBlob(merged, sampleRate);
  return { wavBlob, pcm: merged, sampleRate };
}
