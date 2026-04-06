import { describe, expect, it } from "vitest";
import { executeSncCommands, parseSncText } from "./sncParser";
import { SimpleMixer } from "./simpleMixer";

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
    const commands = [
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
});
