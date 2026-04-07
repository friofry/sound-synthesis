import type { Line, SerializedDot, SerializedGraph } from "./types";

const INT32_SIZE = 4;
const FLOAT64_SIZE = 8;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

type EdgeRecord = {
  ni: number;
  ki: number;
};

function validateGraph(graph: SerializedGraph): void {
  if (!graph || !Array.isArray(graph.dots) || !Array.isArray(graph.lines)) {
    throw new Error("Invalid graph payload");
  }
}

function buildAdjacency(graph: SerializedGraph): EdgeRecord[][] {
  const adjacency: EdgeRecord[][] = Array.from({ length: graph.dots.length }, () => []);
  for (const line of graph.lines) {
    if (line.dot1 < 0 || line.dot2 < 0 || line.dot1 >= graph.dots.length || line.dot2 >= graph.dots.length) {
      throw new Error("Line references out-of-range dot index");
    }
    adjacency[line.dot1].push({ ni: line.dot2, ki: line.k });
    adjacency[line.dot2].push({ ni: line.dot1, ki: line.k });
  }
  return adjacency;
}

function normalizeInputFile(inputFile: string | null | undefined): string {
  return inputFile ?? "";
}

export function graphToBinary(graph: SerializedGraph): ArrayBuffer {
  validateGraph(graph);
  const adjacency = buildAdjacency(graph);

  let totalBytes = INT32_SIZE;

  for (const dot of graph.dots) {
    const name = normalizeInputFile(dot.inputFile);
    const nameBytes = textEncoder.encode(name);
    totalBytes += INT32_SIZE * 4 + FLOAT64_SIZE * 3 + nameBytes.length + 1;
  }

  for (const edges of adjacency) {
    totalBytes += INT32_SIZE + edges.length * (INT32_SIZE + FLOAT64_SIZE);
  }

  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let offset = 0;

  view.setInt32(offset, graph.dots.length, true);
  offset += INT32_SIZE;

  for (const dot of graph.dots) {
    const name = normalizeInputFile(dot.inputFile);
    const nameBytes = textEncoder.encode(name);
    const len = nameBytes.length + 1;

    view.setInt32(offset, dot.x, true);
    offset += INT32_SIZE;
    view.setInt32(offset, dot.y, true);
    offset += INT32_SIZE;
    view.setFloat64(offset, dot.weight, true);
    offset += FLOAT64_SIZE;
    view.setFloat64(offset, dot.v, true);
    offset += FLOAT64_SIZE;
    view.setFloat64(offset, dot.u, true);
    offset += FLOAT64_SIZE;
    view.setInt32(offset, dot.fixed ? 1 : 0, true);
    offset += INT32_SIZE;
    view.setInt32(offset, len, true);
    offset += INT32_SIZE;

    bytes.set(nameBytes, offset);
    offset += nameBytes.length;
    bytes[offset] = 0;
    offset += 1;
  }

  for (const edges of adjacency) {
    view.setInt32(offset, edges.length, true);
    offset += INT32_SIZE;
    for (const edge of edges) {
      view.setInt32(offset, edge.ni, true);
      offset += INT32_SIZE;
      view.setFloat64(offset, edge.ki, true);
      offset += FLOAT64_SIZE;
    }
  }

  return buffer;
}

function readNullTerminated(bytes: Uint8Array): string {
  let end = bytes.indexOf(0);
  if (end === -1) {
    end = bytes.length;
  }
  return textDecoder.decode(bytes.subarray(0, end));
}

function orderedKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function graphFromBinary(buffer: ArrayBuffer): SerializedGraph {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let offset = 0;

  const ensure = (count: number): void => {
    if (offset + count > buffer.byteLength) {
      throw new Error("Unexpected end of .gph buffer");
    }
  };

  ensure(INT32_SIZE);
  const n = view.getInt32(offset, true);
  offset += INT32_SIZE;
  if (n < 0) {
    throw new Error("Invalid .gph dot count");
  }

  const dots: SerializedDot[] = [];
  for (let i = 0; i < n; i += 1) {
    ensure(INT32_SIZE * 4 + FLOAT64_SIZE * 3);
    const x = view.getInt32(offset, true);
    offset += INT32_SIZE;
    const y = view.getInt32(offset, true);
    offset += INT32_SIZE;
    const weight = view.getFloat64(offset, true);
    offset += FLOAT64_SIZE;
    const v = view.getFloat64(offset, true);
    offset += FLOAT64_SIZE;
    const u = view.getFloat64(offset, true);
    offset += FLOAT64_SIZE;
    const fixedRaw = view.getInt32(offset, true);
    offset += INT32_SIZE;
    const len = view.getInt32(offset, true);
    offset += INT32_SIZE;

    if (len < 0) {
      throw new Error("Invalid .gph string length");
    }
    ensure(len);
    const name = readNullTerminated(bytes.subarray(offset, offset + len));
    offset += len;

    dots.push({
      x,
      y,
      u,
      v,
      weight,
      fixed: fixedRaw !== 0,
      inputFile: name.length ? name : null,
    });
  }

  const lines: Line[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < n; i += 1) {
    ensure(INT32_SIZE);
    const k = view.getInt32(offset, true);
    offset += INT32_SIZE;
    if (k < 0) {
      throw new Error("Invalid .gph adjacency size");
    }

    for (let j = 0; j < k; j += 1) {
      ensure(INT32_SIZE + FLOAT64_SIZE);
      const ni = view.getInt32(offset, true);
      offset += INT32_SIZE;
      const ki = view.getFloat64(offset, true);
      offset += FLOAT64_SIZE;

      if (ni < 0 || ni >= n || ni === i) {
        continue;
      }
      const key = orderedKey(i, ni);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      lines.push({ dot1: Math.min(i, ni), dot2: Math.max(i, ni), k: ki });
    }
  }

  return { dots, lines };
}

export function graphToJSON(graph: SerializedGraph): string {
  validateGraph(graph);
  return JSON.stringify(graph);
}

export function graphFromJSON(json: string): SerializedGraph {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(`Invalid graph JSON: ${(error as Error).message}`);
  }
  validateGraph(parsed as SerializedGraph);
  return parsed as SerializedGraph;
}
