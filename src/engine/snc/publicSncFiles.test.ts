import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { RawInstrumentNote } from "../types";
import { parseSncText } from "./sncParser";
import { renderSncTextToWav } from "./renderSncFromText";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNC_DIR = join(__dirname, "../../../public/snc");

function dummyInstrument(noteCount: number): RawInstrumentNote[] {
  return Array.from({ length: noteCount }, (_, index) => ({
    alias: `note-${index}`,
    keyLabel: String(index),
    keyCode: "KeyA",
    index,
    frequency: 440,
    buffer: new Float32Array(4000),
    sampleRate: 48_000,
  }));
}

const sncFiles = readdirSync(SNC_DIR)
  .filter((name) => name.endsWith(".snc"))
  .sort();

/**
 * These reference drum/sample aliases (Back, Drum, …) that are not defined in the same file
 * and cannot map to `note-*`. Parsing still succeeds.
 */
const EXPECT_RENDER_FAIL = new Set(["axel_w_drum.snc", "fur_elise_drum.snc"]);

describe("public/snc/*.snc", () => {
  it("has at least one .snc fixture", () => {
    expect(sncFiles.length).toBeGreaterThan(0);
  });

  describe.each(sncFiles)("%s", (filename) => {
    it("parseSncText succeeds", () => {
      const text = readFileSync(join(SNC_DIR, filename), "utf8");
      expect(() => parseSncText(text)).not.toThrow();
    });

    it(
      EXPECT_RENDER_FAIL.has(filename)
        ? "renderSncTextToWav fails (undefined drum aliases in source)"
        : "renderSncTextToWav succeeds with dummy instrument",
      () => {
        const text = readFileSync(join(SNC_DIR, filename), "utf8");
        if (EXPECT_RENDER_FAIL.has(filename)) {
          expect(() => renderSncTextToWav(text, dummyInstrument(24))).toThrow(/Unknown alias/);
        } else {
          const { pcm } = renderSncTextToWav(text, dummyInstrument(24));
          expect(pcm.length).toBeGreaterThan(0);
        }
      },
    );
  });
});
