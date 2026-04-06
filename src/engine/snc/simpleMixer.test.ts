import { describe, expect, it } from "vitest";
import { SimpleMixer } from "./simpleMixer";
import { MixMode } from "./types";

describe("SimpleMixer", () => {
  it("mixes and saturates int16 output", () => {
    const mixer = new SimpleMixer(MixMode.Saturation);
    mixer.addBuffer(new Int16Array([30_000, -30_000]));
    mixer.addBuffer(new Int16Array([30_000, -30_000]));

    expect(Array.from(mixer.getBuffer())).toEqual([32_767, -32_768]);
  });

  it("normalizes with regulation mode", () => {
    const mixer = new SimpleMixer(MixMode.Regulation);
    mixer.addBuffer(new Int16Array([10_000, -20_000]));
    const buffer = mixer.getBuffer();

    expect(Math.abs(buffer[1])).toBe(28_000);
    expect(Math.abs(buffer[0])).toBe(14_000);
  });

  it("supports slicing and cutting buffer", () => {
    const mixer = new SimpleMixer();
    mixer.addBuffer(new Int16Array([1, 2, 3, 4]));

    expect(Array.from(mixer.getBuffer(2, 1))).toEqual([2, 3]);

    mixer.cutBuffer(2);
    expect(Array.from(mixer.getBuffer())).toEqual([3, 4]);
  });
});
