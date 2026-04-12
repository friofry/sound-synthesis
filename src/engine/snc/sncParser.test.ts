import { describe, expect, it } from "vitest";
import { executeSncCommands, parseSncText } from "./sncParser";
import { SimpleMixer } from "./simpleMixer";
import type { SncCommand } from "./types";

function createConstantStream(value: number) {
  return {
    getSamples(durationSeconds: number): Int16Array {
      const sampleRate = 10;
      const size = Math.max(0, Math.round(durationSeconds * sampleRate));
      const out = new Int16Array(size);
      out.fill(value);
      return out;
    },
    reset(): void {
      // no-op for tests
    },
  };
}

describe("parseSncText", () => {
  it("strips inline -- comments from command lines", () => {
    const parsed = parseSncText("1G a 0.5 --f\n!wait 0.5\n");
    expect(parsed.commands).toEqual([
      { type: "alias", name: "1G", flag: "a", duration: 0.5 },
      { type: "wait", seconds: 0.5 },
    ]);
  });

  it("maps !stop alias to release", () => {
    const parsed = parseSncText("4E a -1\n!stop 4E\n");
    expect(parsed.commands).toEqual([
      { type: "alias", name: "4E", flag: "a", duration: -1 },
      { type: "alias", name: "4E", flag: "r", duration: 0 },
    ]);
  });

  it("parses alias blocks and command lines", () => {
    const parsed = parseSncText(`
      !begin alias
      lead lead.wav 0.8
      !end alias
      lead a -1
      !wait 0.3
      lead r 0
      !clear
    `);

    expect(parsed.aliases.get("lead")).toEqual({
      name: "lead",
      source: "lead.wav",
      gain: 0.8,
    });
    expect(parsed.commands).toEqual([
      { type: "alias", name: "lead", flag: "a", duration: -1 },
      { type: "wait", seconds: 0.3 },
      { type: "alias", name: "lead", flag: "r", duration: 0 },
      { type: "clear" },
    ]);
  });

  it("throws on malformed alias blocks", () => {
    expect(() => parseSncText("!end alias")).toThrow(/Unexpected !end alias/);
    expect(() => parseSncText("!begin alias\nlead source.wav 1")).toThrow(/Unclosed !begin alias block/);
  });
});

describe("executeSncCommands", () => {
  it("mixes active alias chunks on wait and emits callback chunk", () => {
    const commands: SncCommand[] = [
      { type: "alias", name: "a", flag: "a", duration: -1 as const },
      { type: "wait", seconds: 0.5 },
      { type: "alias", name: "a", flag: "r", duration: 0 },
    ];
    const mixer = new SimpleMixer();
    const waits: Int16Array[] = [];

    executeSncCommands(
      commands,
      mixer,
      {
        sampleRate: 10,
        knownAliases: ["a"],
        createStreamForAlias: () => createConstantStream(100),
      },
      (chunk) => waits.push(chunk),
    );

    expect(waits).toHaveLength(1);
    expect(Array.from(waits[0])).toEqual([100, 100, 100, 100, 100]);
    expect(mixer.size).toBe(0);
  });

  it("throws when command references unknown alias", () => {
    const mixer = new SimpleMixer();
    expect(() =>
      executeSncCommands(
        [{ type: "alias", name: "missing", flag: "a", duration: -1 }],
        mixer,
        {
          sampleRate: 10,
          knownAliases: ["known"],
          createStreamForAlias: () => createConstantStream(1),
        },
      ),
    ).toThrow(/Unknown alias/);
  });

  it("resets the stream when the same alias is attacked again with a -1", () => {
    const pcm = Int16Array.from([7, 8, 9, 1, 2, 3, 4, 5, 6]);
    let resetCount = 0;
    const commands: SncCommand[] = [
      { type: "alias", name: "n", flag: "a", duration: -1 as const },
      { type: "wait", seconds: 0.2 },
      { type: "alias", name: "n", flag: "a", duration: -1 as const },
      { type: "wait", seconds: 0.2 },
    ];
    const mixer = new SimpleMixer();
    const waits: Int16Array[] = [];

    executeSncCommands(
      commands,
      mixer,
      {
        sampleRate: 10,
        knownAliases: ["n"],
        createStreamForAlias: () => {
          let offset = 0;
          return {
            getSamples(durationSeconds: number) {
              const sampleCount = Math.max(0, Math.round(durationSeconds * 10));
              const chunk = new Int16Array(sampleCount);
              const available = Math.max(0, Math.min(sampleCount, pcm.length - offset));
              if (available > 0) {
                chunk.set(pcm.subarray(offset, offset + available));
                offset += available;
              }
              return chunk;
            },
            reset() {
              resetCount += 1;
              offset = 0;
            },
          };
        },
      },
      (chunk) => waits.push(chunk),
    );

    expect(resetCount).toBe(1);
    expect(waits).toHaveLength(2);
    expect(Array.from(waits[0])).toEqual([7, 8]);
    expect(Array.from(waits[1])).toEqual([7, 8]);
  });

  it("emits silence for !wait when no aliases are sustaining (rests)", () => {
    const commands: SncCommand[] = [
      { type: "wait", seconds: 0.3 },
      { type: "alias", name: "a", flag: "a", duration: -1 as const },
      { type: "wait", seconds: 0.2 },
    ];
    const mixer = new SimpleMixer();
    const waits: Int16Array[] = [];

    executeSncCommands(
      commands,
      mixer,
      {
        sampleRate: 10,
        knownAliases: ["a"],
        createStreamForAlias: () => createConstantStream(50),
      },
      (chunk) => waits.push(chunk),
    );

    expect(waits).toHaveLength(2);
    expect(waits[0]!.length).toBe(3);
    expect(Array.from(waits[0]!)).toEqual([0, 0, 0]);
    expect(waits[1]!.length).toBe(2);
    expect(Array.from(waits[1]!)).toEqual([50, 50]);
  });
});
