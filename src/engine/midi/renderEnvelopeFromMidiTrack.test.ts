import { describe, expect, it } from "vitest";
import { renderEnvelopeOptionsForMidiTrack } from "./renderEnvelopeFromMidiTrack";

describe("renderEnvelopeOptionsForMidiTrack", () => {
  it("shrinks attack/release when the score has very short notes (fast staccato)", () => {
    const track = {
      notes: [
        { duration: 0.08 },
        { duration: 0.09 },
        { duration: 0.012 },
        { duration: 0.085 },
      ],
    } as Parameters<typeof renderEnvelopeOptionsForMidiTrack>[0];

    const opts = renderEnvelopeOptionsForMidiTrack(track);
    expect(opts.noteAttackMs).toBeDefined();
    expect(opts.releaseFadeMs).toBeDefined();
    expect(opts.noteAttackMs!).toBeLessThanOrEqual(6);
    expect(opts.releaseFadeMs!).toBeLessThanOrEqual(14);
    expect(opts.noteAttackMs!).toBeGreaterThanOrEqual(0.8);
    expect(opts.releaseFadeMs!).toBeGreaterThanOrEqual(1.5);
  });
});
