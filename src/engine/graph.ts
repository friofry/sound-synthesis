import {
  IGNORE_RADIUS,
  START_K,
  START_U,
  START_V,
  START_W,
  type Dot,
  type GraphPerturbation,
  type GraphData,
  type KoeffStr,
  type Line,
  type SerializedDot,
  type SerializedGraph,
  type TopologyDot,
} from "./types";

const asKey = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

export class GraphModel {
  private topologyDots: TopologyDot[] = [];
  private mergedDotsCache: Dot[] | null = null;
  lines: Line[] = [];
  playingPoint: number | null = null;
  editorPerturbation: GraphPerturbation = { kind: "instant", playingPoint: null, points: [] };

  get dots(): Dot[] {
    if (!this.mergedDotsCache) {
      this.mergedDotsCache = this.topologyDots.map((dot, index) => {
        const point = this.editorPerturbation.points[index] ?? { u: START_U, v: START_V };
        return {
          x: dot.x,
          y: dot.y,
          u: point.u,
          v: point.v,
          weight: dot.weight,
          fixed: dot.fixed,
          inputFile: dot.inputFile,
          lines: dot.lines,
        };
      });
    }
    return this.mergedDotsCache;
  }

  clear(): void {
    this.topologyDots = [];
    this.lines = [];
    this.playingPoint = null;
    this.editorPerturbation = { kind: "instant", playingPoint: null, points: [] };
    this.invalidateDotsCache();
  }

  size(): number {
    return this.dots.length;
  }

  addDot(
    x: number,
    y: number,
    u = START_U,
    v = START_V,
    weight = START_W,
    fixed = false,
    inputFile: string | null = null,
  ): number {
    this.topologyDots.push({ x, y, weight, fixed, inputFile, lines: [] });
    this.editorPerturbation.points.push({ u, v });
    this.invalidateDotsCache();
    return this.topologyDots.length - 1;
  }

  addLine(dot1: number, dot2: number, k = START_K): boolean {
    if (dot1 === dot2 || dot1 < 0 || dot2 < 0 || dot1 >= this.size() || dot2 >= this.size()) {
      return false;
    }
    if (this.existsLine(dot1, dot2)) {
      return false;
    }
    const line: Line = { dot1, dot2, k };
    this.lines.push(line);
    this.topologyDots[dot1].lines.push(line);
    this.topologyDots[dot2].lines.push(line);
    this.invalidateDotsCache();
    return true;
  }

  delLine(dot1: number, dot2: number): void {
    const key = asKey(dot1, dot2);
    this.lines = this.lines.filter((line) => asKey(line.dot1, line.dot2) !== key);
    this.rebuildDotLines();
  }

  delDot(index: number): void {
    if (index < 0 || index >= this.size()) {
      return;
    }
    this.topologyDots.splice(index, 1);
    this.editorPerturbation.points.splice(index, 1);
    const nextLines: Line[] = [];
    for (const line of this.lines) {
      if (line.dot1 === index || line.dot2 === index) {
        continue;
      }
      nextLines.push({
        dot1: line.dot1 > index ? line.dot1 - 1 : line.dot1,
        dot2: line.dot2 > index ? line.dot2 - 1 : line.dot2,
        k: line.k,
      });
    }
    this.lines = nextLines;
    if (this.playingPoint !== null) {
      if (this.playingPoint === index) {
        this.playingPoint = null;
      } else if (this.playingPoint > index) {
        this.playingPoint -= 1;
      }
    }
    if (this.editorPerturbation.playingPoint !== null && this.editorPerturbation.playingPoint !== undefined) {
      if (this.editorPerturbation.playingPoint === index) {
        this.editorPerturbation.playingPoint = null;
      } else if (this.editorPerturbation.playingPoint > index) {
        this.editorPerturbation.playingPoint -= 1;
      }
    }
    this.rebuildDotLines();
    this.invalidateDotsCache();
  }

  existsLine(dot1: number, dot2: number): boolean {
    const key = asKey(dot1, dot2);
    return this.lines.some((line) => asKey(line.dot1, line.dot2) === key);
  }

  getLine(dot1: number, dot2: number): Line | null {
    const key = asKey(dot1, dot2);
    return this.lines.find((line) => asKey(line.dot1, line.dot2) === key) ?? null;
  }

  setLineK(dot1: number, dot2: number, k: number): void {
    const line = this.getLine(dot1, dot2);
    if (line) {
      line.k = k;
      this.rebuildDotLines();
    }
  }

  getDot(index: number): Dot | null {
    return this.dots[index] ?? null;
  }

  setDotFixed(index: number, fixed: boolean): void {
    const dot = this.topologyDots[index];
    if (dot) {
      dot.fixed = fixed;
      if (fixed && this.playingPoint === index) {
        this.playingPoint = null;
      }
      if (fixed && this.editorPerturbation.playingPoint === index) {
        this.editorPerturbation.playingPoint = null;
      }
      this.invalidateDotsCache();
    }
  }

  setDotProps(index: number, partial: Partial<Omit<Dot, "lines">>): void {
    const topology = this.topologyDots[index];
    if (!topology) {
      return;
    }
    const point = this.editorPerturbation.points[index] ?? { u: START_U, v: START_V };
    this.topologyDots[index] = {
      x: partial.x ?? topology.x,
      y: partial.y ?? topology.y,
      weight: partial.weight ?? topology.weight,
      fixed: partial.fixed ?? topology.fixed,
      inputFile: partial.inputFile ?? topology.inputFile,
      lines: topology.lines,
    };
    this.editorPerturbation.points[index] = {
      u: partial.u ?? point.u,
      v: partial.v ?? point.v,
    };
    if ((partial.fixed ?? topology.fixed) && this.editorPerturbation.playingPoint === index) {
      this.editorPerturbation.playingPoint = null;
    }
    if ((partial.fixed ?? topology.fixed) && this.playingPoint === index) {
      this.playingPoint = null;
    }
    this.invalidateDotsCache();
  }

  moveDot(index: number, x: number, y: number): void {
    const dot = this.topologyDots[index];
    if (dot) {
      dot.x = x;
      dot.y = y;
      this.invalidateDotsCache();
    }
  }

  getDotIndexByCoords(x: number, y: number, threshold = IGNORE_RADIUS): number {
    if (!this.dots.length) {
      return -1;
    }
    let min = Number.POSITIVE_INFINITY;
    let idx = -1;
    this.dots.forEach((dot, i) => {
      const dist = Math.hypot(x - dot.x, y - dot.y);
      if (dist < min) {
        min = dist;
        idx = i;
      }
    });
    return min <= threshold ? idx : -1;
  }

  getLineIndexNearPoint(x: number, y: number, threshold = 10): number {
    let best = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    this.lines.forEach((line, index) => {
      const a = this.dots[line.dot1];
      const b = this.dots[line.dot2];
      if (!a || !b) {
        return;
      }
      const d = distancePointToSegment(x, y, a.x, a.y, b.x, b.y);
      if (d < threshold && d < bestDistance) {
        bestDistance = d;
        best = index;
      }
    });
    return best;
  }

  createConnectionStructure(): KoeffStr[] {
    const coeffs: KoeffStr[] = [];
    const freeIndex = buildFreeIndexMap(this.dots);

    for (const line of this.lines) {
      const d1 = this.dots[line.dot1];
      const d2 = this.dots[line.dot2];
      if (!d1 || !d2) {
        continue;
      }

      if (!d1.fixed && !d2.fixed) {
        const i1 = freeIndex[line.dot1];
        const i2 = freeIndex[line.dot2];
        coeffs.push({ i: i1, j: i1, value: -line.k / d1.weight });
        coeffs.push({ i: i1, j: i2, value: line.k / d1.weight });
        coeffs.push({ i: i2, j: i2, value: -line.k / d2.weight });
        coeffs.push({ i: i2, j: i1, value: line.k / d2.weight });
        continue;
      }

      if (!d1.fixed) {
        const i1 = freeIndex[line.dot1];
        coeffs.push({ i: i1, j: i1, value: -line.k / d1.weight });
      }
      if (!d2.fixed) {
        const i2 = freeIndex[line.dot2];
        coeffs.push({ i: i2, j: i2, value: -line.k / d2.weight });
      }
    }

    return coeffs;
  }

  createInitBuffer(): { u: Float64Array; v: Float64Array } {
    return this.createInitBufferFromPerturbation(this.editorPerturbation);
  }

  createInitBufferFromPerturbation(perturbation: GraphPerturbation | null = this.editorPerturbation): {
    u: Float64Array;
    v: Float64Array;
  } {
    const points = resolvePerturbationPoints(this.topologyDots.length, perturbation ?? this.editorPerturbation);
    const u: number[] = [];
    const v: number[] = [];
    for (let index = 0; index < this.topologyDots.length; index += 1) {
      const dot = this.topologyDots[index];
      if (!dot.fixed) {
        const point = points[index];
        u.push(point.u);
        v.push(point.v);
      }
    }
    return { u: Float64Array.from(u), v: Float64Array.from(v) };
  }

  clone(): GraphModel {
    return GraphModel.fromJSON(this.toJSON());
  }

  toJSON(): SerializedGraph {
    return {
      dots: this.getDotsForPerturbation().map(stripDotLines),
      lines: this.lines.map((line) => ({ ...line })),
      playingPoint: this.playingPoint,
      editorPerturbation: clonePerturbation(this.editorPerturbation),
    };
  }

  toGraphData(perturbation: GraphPerturbation | null = this.editorPerturbation): GraphData {
    const resolvedPerturbation = perturbation ?? this.editorPerturbation;
    return {
      dots: this.getDotsForPerturbation(resolvedPerturbation).map(stripDotLines),
      lines: this.lines.map((line) => ({ ...line })),
      playingPoint: this.resolvePlayingPoint(resolvedPerturbation),
    };
  }

  getDotsForPerturbation(perturbation: GraphPerturbation | null = this.editorPerturbation): Dot[] {
    const points = resolvePerturbationPoints(this.topologyDots.length, perturbation ?? this.editorPerturbation);
    return this.topologyDots.map((dot, index) => {
      const point = points[index];
      return {
        x: dot.x,
        y: dot.y,
        u: point.u,
        v: point.v,
        weight: dot.weight,
        fixed: dot.fixed,
        inputFile: dot.inputFile,
        lines: dot.lines,
      };
    });
  }

  getEditorPerturbation(): GraphPerturbation {
    return clonePerturbation(this.editorPerturbation);
  }

  setEditorPerturbation(perturbation: GraphPerturbation | null): void {
    this.editorPerturbation = clonePerturbation(
      normalizePerturbationForDotCount(this.topologyDots.length, perturbation),
    );
    this.invalidateDotsCache();
  }

  clearEditorPerturbation(): void {
    this.setEditorPerturbation(createZeroPerturbation(this.topologyDots.length));
  }

  resolvePlayingPoint(perturbation: GraphPerturbation | null = this.editorPerturbation): number {
    if (this.dots.length === 0) {
      return 0;
    }
    const candidate = perturbation?.playingPoint ?? this.playingPoint;
    if (
      candidate !== null &&
      candidate !== undefined &&
      Number.isInteger(candidate) &&
      candidate >= 0 &&
      candidate < this.dots.length &&
      !this.dots[candidate]?.fixed
    ) {
      return candidate;
    }
    return this.findFirstPlayableDot();
  }

  findFirstPlayableDot(): number {
    const index = this.dots.findIndex((dot) => !dot.fixed);
    return index >= 0 ? index : 0;
  }

  static fromJSON(payload: SerializedGraph): GraphModel {
    const graph = new GraphModel();
    graph.topologyDots = payload.dots.map((dot) => ({
      x: dot.x,
      y: dot.y,
      weight: dot.weight,
      fixed: dot.fixed,
      inputFile: dot.inputFile,
      lines: [],
    }));
    graph.lines = payload.lines.map((line) => ({ ...line }));
    graph.editorPerturbation = normalizePerturbationForDotCount(graph.topologyDots.length, payload.editorPerturbation);
    graph.playingPoint = payload.playingPoint ?? graph.editorPerturbation.playingPoint ?? null;
    graph.rebuildDotLines();
    graph.invalidateDotsCache();
    return graph;
  }

  private rebuildDotLines(): void {
    this.topologyDots = this.topologyDots.map((dot) => ({ ...dot, lines: [] }));
    this.lines.forEach((line) => {
      this.topologyDots[line.dot1]?.lines.push(line);
      this.topologyDots[line.dot2]?.lines.push(line);
    });
    this.invalidateDotsCache();
  }

  private invalidateDotsCache(): void {
    this.mergedDotsCache = null;
  }
}

function buildFreeIndexMap(dots: Array<Pick<Dot, "fixed">>): number[] {
  const map = new Array(dots.length).fill(-1);
  let cursor = 0;
  for (let i = 0; i < dots.length; i += 1) {
    if (!dots[i].fixed) {
      map[i] = cursor;
      cursor += 1;
    }
  }
  return map;
}

function stripDotLines(dot: Dot): SerializedDot {
  return {
    x: dot.x,
    y: dot.y,
    u: dot.u,
    v: dot.v,
    weight: dot.weight,
    fixed: dot.fixed,
    inputFile: dot.inputFile,
  };
}

export function createZeroPerturbation(dotCount: number): GraphPerturbation {
  return {
    kind: "instant",
    playingPoint: null,
    points: Array.from({ length: dotCount }, () => ({ u: START_U, v: START_V })),
  };
}

export function clonePerturbation(perturbation: GraphPerturbation | null | undefined): GraphPerturbation {
  return normalizePerturbationForDotCount(perturbation?.points.length ?? 0, perturbation);
}

export function normalizePerturbationForDotCount(
  dotCount: number,
  perturbation: GraphPerturbation | null | undefined,
): GraphPerturbation {
  const sourcePoints = perturbation?.points ?? [];
  const rawPlayingPoint = perturbation?.playingPoint;
  return {
    kind: "instant",
    playingPoint:
      Number.isInteger(rawPlayingPoint) && rawPlayingPoint >= 0 && rawPlayingPoint < dotCount ? rawPlayingPoint : null,
    points: Array.from({ length: dotCount }, (_, index) => ({
      u: sourcePoints[index]?.u ?? START_U,
      v: sourcePoints[index]?.v ?? START_V,
    })),
  };
}

function resolvePerturbationPoints(
  dotCount: number,
  perturbation: GraphPerturbation | null | undefined,
): Array<{ u: number; v: number }> {
  return normalizePerturbationForDotCount(dotCount, perturbation).points;
}

function distancePointToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    return Math.hypot(px - x1, py - y1);
  }
  const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
  const clamped = Math.max(0, Math.min(1, t));
  const projX = x1 + clamped * dx;
  const projY = y1 + clamped * dy;
  return Math.hypot(px - projX, py - projY);
}
