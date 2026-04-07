import { describe, expect, it } from "vitest";
import type { SerializedGraph } from "../types";
import { graphFromBinary, graphToBinary } from "./graphFile";

describe("graphFile legacy .gph compatibility", () => {
  it("writes the legacy binary layout byte-for-byte", () => {
    const graph: SerializedGraph = {
      dots: [
        { x: 10, y: 20, u: 1.5, v: -2.25, weight: 0.000001, fixed: false, inputFile: null },
        { x: 30, y: 40, u: 3.25, v: 4.5, weight: 2.75, fixed: true, inputFile: "kick.wav" },
      ],
      lines: [{ dot1: 0, dot2: 1, k: 7.5 }],
    };

    const expected = serializeLegacyGph(graph);
    const actual = new Uint8Array(graphToBinary(graph));

    expect(actual).toEqual(expected);
  });

  it("reads a legacy .gph payload into the current graph shape", () => {
    const graph: SerializedGraph = {
      dots: [
        { x: 5, y: 6, u: 0, v: 1, weight: 2, fixed: false, inputFile: "" },
        { x: 15, y: 16, u: 3, v: 4, weight: 5, fixed: true, inputFile: "old.wav" },
        { x: 25, y: 26, u: 6, v: 7, weight: 8, fixed: false, inputFile: null },
      ],
      lines: [
        { dot1: 0, dot2: 1, k: 9.5 },
        { dot1: 1, dot2: 2, k: 10.5 },
      ],
    };

    const parsed = graphFromBinary(serializeLegacyGph(graph).buffer);

    expect(parsed).toEqual({
      dots: [
        { x: 5, y: 6, u: 0, v: 1, weight: 2, fixed: false, inputFile: null },
        { x: 15, y: 16, u: 3, v: 4, weight: 5, fixed: true, inputFile: "old.wav" },
        { x: 25, y: 26, u: 6, v: 7, weight: 8, fixed: false, inputFile: null },
      ],
      lines: [
        { dot1: 0, dot2: 1, k: 9.5 },
        { dot1: 1, dot2: 2, k: 10.5 },
      ],
    });
  });
});

function serializeLegacyGph(graph: SerializedGraph): Uint8Array {
  const adjacency = Array.from({ length: graph.dots.length }, () => [] as Array<{ ni: number; ki: number }>);
  for (const line of graph.lines) {
    adjacency[line.dot1]?.push({ ni: line.dot2, ki: line.k });
    adjacency[line.dot2]?.push({ ni: line.dot1, ki: line.k });
  }

  const totalBytes =
    4 +
    graph.dots.reduce((sum, dot) => sum + 4 + 4 + 8 + 8 + 8 + 4 + 4 + legacyCString(dot.inputFile).length, 0) +
    adjacency.reduce((sum, edges) => sum + 4 + edges.length * (4 + 8), 0);

  const bytes = new Uint8Array(totalBytes);
  const view = new DataView(bytes.buffer);
  let offset = 0;

  view.setInt32(offset, graph.dots.length, true);
  offset += 4;

  for (const dot of graph.dots) {
    const nameBytes = legacyCString(dot.inputFile);
    view.setInt32(offset, dot.x, true);
    offset += 4;
    view.setInt32(offset, dot.y, true);
    offset += 4;
    view.setFloat64(offset, dot.weight, true);
    offset += 8;
    view.setFloat64(offset, dot.v, true);
    offset += 8;
    view.setFloat64(offset, dot.u, true);
    offset += 8;
    view.setInt32(offset, dot.fixed ? 1 : 0, true);
    offset += 4;
    view.setInt32(offset, nameBytes.length, true);
    offset += 4;
    bytes.set(nameBytes, offset);
    offset += nameBytes.length;
  }

  for (const edges of adjacency) {
    view.setInt32(offset, edges.length, true);
    offset += 4;
    for (const edge of edges) {
      view.setInt32(offset, edge.ni, true);
      offset += 4;
      view.setFloat64(offset, edge.ki, true);
      offset += 8;
    }
  }

  return bytes;
}

function legacyCString(inputFile: string | null): Uint8Array {
  const text = inputFile ?? "";
  const bytes = new Uint8Array(text.length + 1);
  for (let i = 0; i < text.length; i += 1) {
    bytes[i] = text.charCodeAt(i) & 0xff;
  }
  bytes[text.length] = 0;
  return bytes;
}
