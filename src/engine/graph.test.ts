import { describe, expect, it } from "vitest";
import { GraphModel } from "./graph";

describe("GraphModel", () => {
  it("rejects invalid and duplicate lines", () => {
    const graph = new GraphModel();
    const a = graph.addDot(0, 0);
    const b = graph.addDot(10, 0);

    expect(graph.addLine(a, b, 3)).toBe(true);
    expect(graph.addLine(a, b, 3)).toBe(false);
    expect(graph.addLine(a, a, 1)).toBe(false);
    expect(graph.addLine(-1, b, 1)).toBe(false);
    expect(graph.addLine(a, 999, 1)).toBe(false);
    expect(graph.lines).toHaveLength(1);
  });

  it("updates playing point and reindexes lines after dot deletion", () => {
    const graph = new GraphModel();
    const d0 = graph.addDot(0, 0);
    const d1 = graph.addDot(10, 0);
    const d2 = graph.addDot(20, 0);
    graph.addLine(d0, d1, 2);
    graph.addLine(d1, d2, 5);
    graph.playingPoint = d2;

    graph.delDot(d1);

    expect(graph.dots).toHaveLength(2);
    expect(graph.lines).toHaveLength(0);
    expect(graph.playingPoint).toBe(1);
  });

  it("builds connection structure for fixed/free configuration", () => {
    const graph = new GraphModel();
    const free = graph.addDot(0, 0, 0, 0, 2, false);
    const fixed = graph.addDot(10, 0, 0, 0, 1, true);
    graph.addLine(free, fixed, 8);

    const coeffs = graph.createConnectionStructure();
    expect(coeffs).toEqual([{ i: 0, j: 0, value: -4 }]);
  });

  it("round-trips through JSON serialization", () => {
    const graph = new GraphModel();
    const a = graph.addDot(1, 2, 3, 4, 5, false, "a.wav");
    const b = graph.addDot(6, 7, 8, 9, 10, true, null);
    graph.addLine(a, b, 11);
    graph.playingPoint = a;

    const restored = GraphModel.fromJSON(graph.toJSON());
    expect(restored.toJSON()).toEqual(graph.toJSON());
  });
});
