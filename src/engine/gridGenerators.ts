import { GraphModel } from "./graph";
import type { GridParams, GridType } from "./types";

export function generateGraph(type: GridType, params: GridParams): GraphModel {
  const graph = new GraphModel();
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
  }
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
      const border = i === 0 || i === n - 1 || j === 0 || j === m - 1;
      graph.addDot(x, y, 0, 0, params.weight, params.fixedBorder && border);
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
    indices.push(graph.addDot(Math.round((j + 1) * dx), Math.round(dy), 0, 0, params.weight, params.fixedBorder));
  }
  for (let i = 1; i < n - 1; i += 1) {
    indices.push(graph.addDot(Math.round(m * dx), Math.round((i + 1) * dy), 0, 0, params.weight, params.fixedBorder));
  }
  for (let j = m - 1; j >= 0; j -= 1) {
    indices.push(graph.addDot(Math.round((j + 1) * dx), Math.round(n * dy), 0, 0, params.weight, params.fixedBorder));
  }
  for (let i = n - 2; i >= 1; i -= 1) {
    indices.push(graph.addDot(Math.round(dx), Math.round((i + 1) * dy), 0, 0, params.weight, params.fixedBorder));
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
    const fixed = params.fixedBorder && layer === layers;
    const ring: number[] = [];
    for (let r = 0; r < rays; r += 1) {
      const angle = (Math.PI * 2 * r) / rays;
      const x = Math.round(centerX + Math.cos(angle) * radius);
      const y = Math.round(centerY + Math.sin(angle) * radius);
      ring.push(graph.addDot(x, y, 0, 0, params.weight, fixed));
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
      const s = -q - r;
      const isBorder = Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) === layers;
      const [x, y] = axialToPixel(q, r, step, centerX, centerY);
      const idx = graph.addDot(Math.round(x), Math.round(y), 0, 0, params.weight, params.fixedBorder && isBorder);
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
