import { GraphModel } from "./graph";
import type { GridParams, GridType } from "./types";

export function generateGraph(type: GridType, params: GridParams): GraphModel {
  const graph = new GraphModel();
  generateTopology(graph, type, params);
  applyNormalizedStiffness(graph, params);
  applyWeightDistribution(graph, type, params);
  applyBoundaryMode(graph, type, params);
  graph.playingPoint = graph.findFirstPlayableDot();
  return graph;
}

export function scaleGraphStiffness(graph: GraphModel, ratio: number): GraphModel {
  const next = graph.clone();
  next.lines.forEach((line) => {
    line.k *= ratio;
  });
  return next;
}

export function stiffnessRatioForPitchRatio(pitchRatio: number): number {
  return pitchRatio ** 2;
}

export function scaleGraphForPitchRatio(graph: GraphModel, pitchRatio: number): GraphModel {
  return scaleGraphStiffness(graph, stiffnessRatioForPitchRatio(pitchRatio));
}

function generateTopology(graph: GraphModel, type: GridType, params: GridParams): void {
  switch (type) {
    case "cell":
      generateCell(graph, params, true);
      break;
    case "perimeter":
      generatePerimeter(graph, params);
      break;
    case "empty":
      generateCell(graph, params, false);
      break;
    case "triangle":
      generateTriangle(graph, params);
      break;
    case "astra":
      generateAstra(graph, params);
      break;
    case "hexagon":
      generateHexagon(graph, params);
      break;
    case "disk-hex":
      generateDiskHex(graph, params);
      break;
  }
}

function generateCell(graph: GraphModel, params: GridParams, withLinks: boolean): void {
  const n = Math.max(1, params.n);
  const m = Math.max(1, params.m);
  const dx = params.width / (m + 1);
  const dy = params.height / (n + 1);
  const centerX = params.width / 2;
  const centerY = params.height / 2;

  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < m; j += 1) {
      const x = Math.round((j + 1) * dx);
      const y = Math.round((i + 1) * dy);
      graph.addDot(x, y, 0, 0, params.weight, false);
    }
  }

  if (!withLinks) {
    return;
  }

  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < m; j += 1) {
      const idx = i * m + j;
      if (i < n - 1) {
        const down = (i + 1) * m + j;
        graph.addLine(idx, down, stiffnessForPair(graph, idx, down, params, centerX, centerY));
      }
      if (j < m - 1) {
        const right = i * m + j + 1;
        graph.addLine(idx, right, stiffnessForPair(graph, idx, right, params, centerX, centerY));
      }
    }
  }
}

function generatePerimeter(graph: GraphModel, params: GridParams): void {
  const n = Math.max(2, params.n);
  const m = Math.max(2, params.m);
  const dx = params.width / (m + 1);
  const dy = params.height / (n + 1);
  const centerX = params.width / 2;
  const centerY = params.height / 2;
  const indices: number[] = [];

  for (let j = 0; j < m; j += 1) {
    indices.push(graph.addDot(Math.round((j + 1) * dx), Math.round(dy), 0, 0, params.weight, false));
  }
  for (let i = 1; i < n - 1; i += 1) {
    indices.push(graph.addDot(Math.round(m * dx), Math.round((i + 1) * dy), 0, 0, params.weight, false));
  }
  for (let j = m - 1; j >= 0; j -= 1) {
    indices.push(graph.addDot(Math.round((j + 1) * dx), Math.round(n * dy), 0, 0, params.weight, false));
  }
  for (let i = n - 2; i >= 1; i -= 1) {
    indices.push(graph.addDot(Math.round(dx), Math.round((i + 1) * dy), 0, 0, params.weight, false));
  }

  for (let i = 0; i < indices.length; i += 1) {
    const a = indices[i];
    const b = indices[(i + 1) % indices.length];
    graph.addLine(a, b, stiffnessForPair(graph, a, b, params, centerX, centerY));
  }
}

function generateTriangle(graph: GraphModel, params: GridParams): void {
  generateCell(graph, params, true);
  const n = Math.max(2, params.n);
  const m = Math.max(2, params.m);
  const centerX = params.width / 2;
  const centerY = params.height / 2;

  for (let i = 0; i < n - 1; i += 1) {
    for (let j = 1; j < m; j += 1) {
      const idx = i * m + j;
      const diag = (i + 1) * m + j - 1;
      graph.addLine(idx, diag, stiffnessForPair(graph, idx, diag, params, centerX, centerY));
    }
  }
}

function generateAstra(graph: GraphModel, params: GridParams): void {
  const rays = Math.max(3, params.n);
  const layers = Math.max(1, params.layers || params.m);
  const centerX = params.width / 2;
  const centerY = params.height / 2;
  const maxRadius = Math.min(params.width, params.height) * 0.45;
  const byLayer: number[][] = [];

  const centerIndex = graph.addDot(Math.round(centerX), Math.round(centerY), 0, 0, params.weight, false);

  for (let layer = 1; layer <= layers; layer += 1) {
    const radius = (maxRadius * layer) / layers;
    const ring: number[] = [];
    for (let r = 0; r < rays; r += 1) {
      const angle = (Math.PI * 2 * r) / rays;
      const x = Math.round(centerX + Math.cos(angle) * radius);
      const y = Math.round(centerY + Math.sin(angle) * radius);
      ring.push(graph.addDot(x, y, 0, 0, params.weight, false));
    }
    byLayer.push(ring);
  }

  for (let r = 0; r < rays; r += 1) {
    const first = byLayer[0][r];
    graph.addLine(centerIndex, first, stiffnessForPair(graph, centerIndex, first, params, centerX, centerY));
  }

  for (let layer = 0; layer < byLayer.length; layer += 1) {
    const ring = byLayer[layer];
    for (let r = 0; r < rays; r += 1) {
      const next = ring[(r + 1) % rays];
      graph.addLine(ring[r], next, stiffnessForPair(graph, ring[r], next, params, centerX, centerY));
      if (layer > 0) {
        const prev = byLayer[layer - 1][r];
        graph.addLine(ring[r], prev, stiffnessForPair(graph, ring[r], prev, params, centerX, centerY));
      }
    }
  }
}

function generateHexagon(graph: GraphModel, params: GridParams): void {
  const layers = Math.max(1, params.layers || params.n);
  const centerX = params.width / 2;
  const centerY = params.height / 2;
  // Keep the axial hex fully inside the target rectangle with a small margin.
  const fit = 0.9;
  const stepByWidth = (params.width * fit) / (2 * Math.sqrt(3) * layers);
  const stepByHeight = (params.height * fit) / (3 * layers);
  const step = Math.min(stepByWidth, stepByHeight);
  const axial = new Map<string, number>();

  for (let q = -layers; q <= layers; q += 1) {
    const r1 = Math.max(-layers, -q - layers);
    const r2 = Math.min(layers, -q + layers);
    for (let r = r1; r <= r2; r += 1) {
      const [x, y] = axialToPixel(q, r, step, centerX, centerY);
      const idx = graph.addDot(Math.round(x), Math.round(y), 0, 0, params.weight, false);
      axial.set(`${q},${r}`, idx);
    }
  }

  const neighbors: Array<[number, number]> = [
    [1, 0],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [0, -1],
    [1, -1],
  ];

  for (const [key, value] of axial.entries()) {
    const [qStr, rStr] = key.split(",");
    const q = Number(qStr);
    const r = Number(rStr);
    for (const [dq, dr] of neighbors) {
      const other = axial.get(`${q + dq},${r + dr}`);
      if (other === undefined || other < value) {
        continue;
      }
      graph.addLine(value, other, stiffnessForPair(graph, value, other, params, centerX, centerY));
    }
  }
}

function generateDiskHex(graph: GraphModel, params: GridParams): void {
  const layers = Math.max(1, params.layers || params.n);
  const centerX = params.width / 2;
  const centerY = params.height / 2;
  const fit = 0.9;
  const maxRadius = Math.min(params.width, params.height) * 0.45;
  const stepByWidth = (params.width * fit) / (2 * Math.sqrt(3) * layers);
  const stepByHeight = (params.height * fit) / (3 * layers);
  const step = Math.min(stepByWidth, stepByHeight);
  const axial = new Map<string, number>();

  for (let q = -layers; q <= layers; q += 1) {
    const r1 = Math.max(-layers, -q - layers);
    const r2 = Math.min(layers, -q + layers);
    for (let r = r1; r <= r2; r += 1) {
      const [x, y] = axialToPixel(q, r, step, centerX, centerY);
      if (Math.hypot(x - centerX, y - centerY) > maxRadius) {
        continue;
      }
      const idx = graph.addDot(Math.round(x), Math.round(y), 0, 0, params.weight, false);
      axial.set(`${q},${r}`, idx);
    }
  }

  const neighbors: Array<[number, number]> = [
    [1, 0],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [0, -1],
    [1, -1],
  ];

  for (const [key, value] of axial.entries()) {
    const [qStr, rStr] = key.split(",");
    const q = Number(qStr);
    const r = Number(rStr);
    for (const [dq, dr] of neighbors) {
      const other = axial.get(`${q + dq},${r + dr}`);
      if (other === undefined || other < value) {
        continue;
      }
      graph.addLine(value, other, stiffnessForPair(graph, value, other, params, centerX, centerY));
    }
  }
}

function axialToPixel(q: number, r: number, step: number, cx: number, cy: number): [number, number] {
  const x = step * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r) + cx;
  const y = step * ((3 / 2) * r) + cy;
  return [x, y];
}

function applyBoundaryMode(graph: GraphModel, type: GridType, params: GridParams): void {
  const boundary = detectBoundaryDots(graph, type, params);
  const mode = params.boundaryMode;

  for (let i = 0; i < graph.dots.length; i += 1) {
    graph.setDotProps(i, { fixed: mode === "fixed" ? boundary.has(i) : false });
  }

  if (mode === "rim-heavy" || mode === "rim-damped") {
    const weightScale = Math.max(1, params.rimWeightRatio ?? 1.5);
    for (const idx of boundary) {
      const dot = graph.getDot(idx);
      if (!dot) {
        continue;
      }
      graph.setDotProps(idx, { weight: dot.weight * weightScale });
    }
  }

  if (mode === "rim-damped") {
    const rimDampingFactor = Math.max(0, Math.min(1, params.rimDampingFactor ?? 0.7));
    for (const line of graph.lines) {
      if (boundary.has(line.dot1) || boundary.has(line.dot2)) {
        line.k *= rimDampingFactor;
      }
    }
  }
}

function applyNormalizedStiffness(graph: GraphModel, params: GridParams): void {
  const mode = params.stiffnessNormalizationMode ?? "none";
  if (mode === "none" || graph.lines.length === 0) {
    return;
  }

  const lengths = graph.lines.map((line) => {
    const d1 = graph.getDot(line.dot1);
    const d2 = graph.getDot(line.dot2);
    if (!d1 || !d2) {
      return 1;
    }
    return Math.max(1e-6, Math.hypot(d2.x - d1.x, d2.y - d1.y));
  });
  const globalMeanLength = mean(lengths) || 1;

  if (mode === "by-edge-length") {
    for (let i = 0; i < graph.lines.length; i += 1) {
      const ratio = globalMeanLength / lengths[i];
      graph.lines[i].k *= ratio;
    }
    return;
  }

  const nodeScale = buildNodeMeanEdgeLength(graph, lengths);
  const globalNodeScale = mean(nodeScale.filter((value) => value > 0)) || globalMeanLength;
  for (let i = 0; i < graph.lines.length; i += 1) {
    const line = graph.lines[i];
    const areaScaleA = nodeScale[line.dot1] || globalNodeScale;
    const areaScaleB = nodeScale[line.dot2] || globalNodeScale;
    const localScale = Math.sqrt(areaScaleA * areaScaleB);
    const ratio = globalNodeScale / Math.max(1e-6, localScale);
    graph.lines[i].k *= ratio * ratio;
  }
}

function applyWeightDistribution(graph: GraphModel, type: GridType, params: GridParams): void {
  const mode = params.weightDistributionMode ?? "uniform";
  if (mode === "uniform") {
    return;
  }

  if (mode === "edge-light") {
    const boundary = detectBoundaryDots(graph, type, params);
    for (const idx of boundary) {
      const dot = graph.getDot(idx);
      if (!dot) {
        continue;
      }
      graph.setDotProps(idx, { weight: dot.weight * 0.8 });
    }
    return;
  }

  const lengths = graph.lines.map((line) => {
    const d1 = graph.getDot(line.dot1);
    const d2 = graph.getDot(line.dot2);
    if (!d1 || !d2) {
      return 1;
    }
    return Math.max(1e-6, Math.hypot(d2.x - d1.x, d2.y - d1.y));
  });
  const nodeScale = buildNodeMeanEdgeLength(graph, lengths);
  const globalNodeScale = mean(nodeScale.filter((value) => value > 0)) || 1;

  for (let i = 0; i < graph.dots.length; i += 1) {
    const dot = graph.getDot(i);
    if (!dot) {
      continue;
    }
    const ratio = (nodeScale[i] || globalNodeScale) / globalNodeScale;
    const areaRatio = Math.max(0.4, Math.min(2.5, ratio * ratio));
    graph.setDotProps(i, { weight: params.weight * areaRatio });
  }
}

function detectBoundaryDots(graph: GraphModel, type: GridType, params: GridParams): Set<number> {
  const boundary = new Set<number>();
  if (graph.dots.length === 0) {
    return boundary;
  }

  if (type === "cell" || type === "empty" || type === "triangle" || type === "perimeter") {
    const xs = graph.dots.map((dot) => dot.x);
    const ys = graph.dots.map((dot) => dot.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const eps = 1;
    for (let i = 0; i < graph.dots.length; i += 1) {
      const dot = graph.dots[i];
      if (
        Math.abs(dot.x - minX) <= eps
        || Math.abs(dot.x - maxX) <= eps
        || Math.abs(dot.y - minY) <= eps
        || Math.abs(dot.y - maxY) <= eps
      ) {
        boundary.add(i);
      }
    }
    return boundary;
  }

  const centerX = params.width / 2;
  const centerY = params.height / 2;
  const distances = graph.dots.map((dot) => Math.hypot(dot.x - centerX, dot.y - centerY));
  const maxDistance = Math.max(...distances, 1);
  for (let i = 0; i < distances.length; i += 1) {
    if (distances[i] >= maxDistance * 0.96) {
      boundary.add(i);
    }
  }
  return boundary;
}

function buildNodeMeanEdgeLength(graph: GraphModel, lengths: number[]): Float64Array {
  const sum = new Float64Array(graph.dots.length);
  const count = new Uint32Array(graph.dots.length);
  for (let i = 0; i < graph.lines.length; i += 1) {
    const line = graph.lines[i];
    const length = lengths[i];
    sum[line.dot1] += length;
    sum[line.dot2] += length;
    count[line.dot1] += 1;
    count[line.dot2] += 1;
  }
  const out = new Float64Array(graph.dots.length);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = count[i] > 0 ? sum[i] / count[i] : 0;
  }
  return out;
}

function mean(values: ArrayLike<number>): number {
  if (values.length === 0) {
    return 0;
  }
  let total = 0;
  for (let i = 0; i < values.length; i += 1) {
    total += values[i];
  }
  return total / values.length;
}

function stiffnessForPair(
  graph: GraphModel,
  i: number,
  j: number,
  params: GridParams,
  centerX: number,
  centerY: number,
): number {
  if (params.stiffnessType === "isotropic") {
    return params.stiffness;
  }

  const d1 = graph.getDot(i);
  const d2 = graph.getDot(j);
  if (!d1 || !d2) {
    return params.stiffness;
  }

  const mx = (d1.x + d2.x) / 2;
  const my = (d1.y + d2.y) / 2;
  const distSq = (mx - centerX) ** 2 + (my - centerY) ** 2;
  const normSq = params.width ** 2 + params.height ** 2 || 1;
  return params.stiffness + (5 * 160 * params.stiffness * (distSq * distSq)) / (normSq * normSq);
}
