import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RawInstrumentNote } from "../types";
import { renderSncTextToWav } from "./renderSncFromText";

const __dirname = dirname(fileURLToPath(import.meta.url));

function dummyInstrument(noteCount: number): RawInstrumentNote[] {
  return Array.from({ length: noteCount }, (_, index) => ({
    alias: `note-${index}`,
    keyLabel: String(index),
    keyCode: "KeyA",
    index,
    frequency: 440,
    buffer: new Float32Array(2000),
    sampleRate: 48_000,
  }));
}

describe("renderSncTextToWav", () => {
  it("renders legacy pitch-style fur_elise_1part.snc from public/snc", () => {
    const text = readFileSync(join(__dirname, "../../../public/snc/fur_elise_1part.snc"), "utf8");
    const { pcm } = renderSncTextToWav(text, dummyInstrument(24));
    expect(pcm.length).toBeGreaterThan(1000);
  });

  it("renders solfege test.snc after alias normalization", () => {
    const text = readFileSync(join(__dirname, "../../../public/snc/test.snc"), "utf8");
    const { pcm } = renderSncTextToWav(text, dummyInstrument(24));
    expect(pcm.length).toBeGreaterThan(100);
  });
});
