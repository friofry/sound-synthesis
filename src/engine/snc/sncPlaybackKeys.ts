import type { RawInstrumentNote } from "../types";
import { normalizeParsedSncForInstrumentNotes } from "./legacySncPitch";
import { parseSncText } from "./sncParser";

export type SncPlaybackInterval = {
  startSec: number;
  endSec: number;
  index: number;
};

function noteIndexFromNormalizedAlias(name: string): number | null {
  const m = /^note-(\d+)$/.exec(name.trim());
  if (!m) {
    return null;
  }
  return Number(m[1]);
}

/**
 * Builds time intervals [start, end) during which each piano key index should appear held,
 * aligned with `executeSncCommands`: each `a -1` keeps a separate sustain until `r` / `!clear` / EOF.
 * One-shot (`a` duration ≥ 0) uses explicit duration.
 */
export function buildSncPlaybackIntervals(
  sncText: string,
  instrumentNotes: RawInstrumentNote[],
): SncPlaybackInterval[] {
  if (instrumentNotes.length === 0) {
    return [];
  }
  const parsed = normalizeParsedSncForInstrumentNotes(parseSncText(sncText), instrumentNotes.length);
  const intervals: { start: number; end: number; index: number }[] = [];
  let t = 0;
  const sustainStart = new Map<number, number>();

  function closeSustain(index: number, endTime: number) {
    const start = sustainStart.get(index);
    if (start === undefined) {
      return;
    }
    if (endTime > start) {
      intervals.push({ start, end: endTime, index });
    }
    sustainStart.delete(index);
  }

  for (const cmd of parsed.commands) {
    if (cmd.type === "clear") {
      for (const index of [...sustainStart.keys()]) {
        closeSustain(index, t);
      }
      continue;
    }
    if (cmd.type === "wait") {
      t += cmd.seconds;
      continue;
    }
    if (cmd.type !== "alias") {
      continue;
    }
    const index = noteIndexFromNormalizedAlias(cmd.name);
    if (index === null) {
      continue;
    }

    if (cmd.flag === "r") {
      closeSustain(index, t);
      continue;
    }

    if (cmd.flag === "a") {
      if (cmd.duration === -1) {
        closeSustain(index, t);
        sustainStart.set(index, t);
      } else if (cmd.duration >= 0) {
        intervals.push({ start: t, end: t + cmd.duration, index });
      }
    }
  }

  for (const index of [...sustainStart.keys()]) {
    closeSustain(index, t);
  }

  return intervals.map(({ start, end, index }) => ({ startSec: start, endSec: end, index }));
}

/**
 * Schedules store `pressKey` / `releaseKey` (visual only — no AudioEngine) from t=0 when playback starts.
 * Does not play sound; pair with HTMLAudioElement for the rendered WAV.
 */
export function scheduleSncPlaybackKeySimulation(
  audio: HTMLAudioElement,
  intervals: SncPlaybackInterval[],
  pressKey: (index: number) => void,
  releaseKey: (index: number) => void,
): () => void {
  const timeoutIds: number[] = [];
  const simHeld = new Set<number>();
  let scheduled = false;

  const run = () => {
    if (scheduled) {
      return;
    }
    scheduled = true;
    for (const iv of intervals) {
      if (!(iv.endSec > iv.startSec)) {
        continue;
      }
      const startMs = iv.startSec * 1000;
      const durMs = (iv.endSec - iv.startSec) * 1000;
      timeoutIds.push(
        window.setTimeout(() => {
          pressKey(iv.index);
          simHeld.add(iv.index);
        }, startMs),
      );
      timeoutIds.push(
        window.setTimeout(() => {
          releaseKey(iv.index);
          simHeld.delete(iv.index);
        }, startMs + durMs),
      );
    }
  };

  const onPlaying = () => {
    run();
  };

  audio.addEventListener("playing", onPlaying);

  if (!audio.paused && audio.readyState >= 2) {
    run();
  }

  return () => {
    audio.removeEventListener("playing", onPlaying);
    for (const id of timeoutIds) {
      window.clearTimeout(id);
    }
    timeoutIds.length = 0;
    for (const index of [...simHeld]) {
      releaseKey(index);
    }
    simHeld.clear();
  };
}
