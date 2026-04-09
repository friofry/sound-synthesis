import { describe, expect, it } from "vitest";
import { generateGraph } from "./gridGenerators";
import { preparePresetGraph } from "./presetGraphPreparation";
import type { GridParams } from "./types";

const GRID_PARAMS: GridParams = {
  n: 5,
  m: 5,
  layers: 5,
  stiffness: 2,
  weight: 0.000001,
  stiffnessType: "isotropic",
  width: 500,
  height: 500,
  boundaryMode: "free",
};

describe("preparePresetGraph", () => {
  it("applies center modify group and centers the playing point", () => {
    const graph = generateGraph("cell", GRID_PARAMS);

    preparePresetGraph(graph, {
      playingPointMode: "center",
      centerGroup: {
        enabled: true,
        maxAmplitude: 0.8,
        maxWeight: 0.000002,
        stiffness: 7,
        distribution: "smoothed",
        fixMode: "none",
      },
    });

    expect(graph.playingPoint).toBe(12);
    expect(graph.dots[12]?.u).toBeCloseTo(0.8);
    expect(graph.dots[12]?.weight).toBeCloseTo(0.000002);
    expect(graph.dots.some((dot) => dot.u > 0)).toBe(true);
    expect(graph.lines.some((line) => line.k === 7)).toBe(true);
  });

  it("clears the playing point when preparation leaves no playable dots", () => {
    const graph = generateGraph("cell", { ...GRID_PARAMS, n: 1, m: 1 });

    preparePresetGraph(graph, {
      playingPointMode: "center",
      centerGroup: {
        enabled: true,
        maxAmplitude: 0.5,
        maxWeight: 0.000001,
        stiffness: 2,
        distribution: "equivalent",
        fixMode: "fix",
      },
    });

    expect(graph.playingPoint).toBeNull();
  });
});
