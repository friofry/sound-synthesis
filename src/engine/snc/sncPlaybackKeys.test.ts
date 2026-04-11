import { describe, expect, it } from "vitest";
import type { RawInstrumentNote } from "../types";
import { buildSncPlaybackIntervals } from "./sncPlaybackKeys";

function dummyNotes(n: number): RawInstrumentNote[] {
  return Array.from({ length: n }, (_, index) => ({
    alias: `note-${index}`,
    keyLabel: String(index),
    keyCode: "KeyA",
    index,
    frequency: 440,
    buffer: new Float32Array(100),
    sampleRate: 48_000,
  }));
}

describe("buildSncPlaybackIntervals", () => {
  it("covers sustained notes across waits", () => {
    const text = `
note-1 a -1
!wait 0.25
note-2 a -1
!wait 0.25
note-1 r 0
`;
    const iv = buildSncPlaybackIntervals(text, dummyNotes(24));
    const one = iv.filter((x) => x.index === 1);
    const two = iv.filter((x) => x.index === 2);
    expect(one.some((x) => x.startSec === 0 && x.endSec === 0.25)).toBe(true);
    expect(two.some((x) => x.startSec === 0.25 && x.endSec === 0.5)).toBe(true);
  });

  it("covers one-shot durations", () => {
    const text = `
note-0 a 0.2
!wait 0.2
`;
    const iv = buildSncPlaybackIntervals(text, dummyNotes(24));
    expect(iv).toContainEqual({ startSec: 0, endSec: 0.2, index: 0 });
  });
});
