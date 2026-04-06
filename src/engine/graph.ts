import {
  IGNORE_RADIUS,
  START_K,
  START_U,
  START_V,
  START_W,
  type Dot,
  type GraphData,
  type KoeffStr,
  type Line,
  type SerializedDot,
  type SerializedGraph,
} from "./types";

const asKey = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

export class GraphModel {
  dots: Dot[] = [];
  lines: Line[] = [];
  playingPoint: number | null = null;

  clear(): void {
    this.dots = [];
    this.lines = [];
    this.playingPoint = null;
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
    this.dots.push({ x, y, u, v, weight, fixed, inputFile, lines: [] });
    return this.dots.length - 1;
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
    this.dots[dot1].lines.push(line);
    this.dots[dot2].lines.push(line);
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
    this.dots.splice(index, 1);
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
    this.rebuildDotLines();
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
    const dot = this.dots[index];
    if (dot) {
      dot.fixed = fixed;
      if (fixed && this.playingPoint === index) {
        this.playingPoint = null;
      }
    }
  }

  setDotProps(index: number, partial: Partial<Omit<Dot, "lines">>): void {
    const dot = this.dots[index];
    if (!dot) {
      return;
    }
    this.dots[index] = { ...dot, ...partial };
  }

  moveDot(index: number, x: number, y: number): void {
    const dot = this.dots[index];
    if (dot) {
      dot.x = x;
      dot.y = y;
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
    const u: number[] = [];
    const v: number[] = [];
    for (const dot of this.dots) {
      if (!dot.fixed) {
        u.push(dot.u);
        v.push(dot.v);
      }
    }
    return { u: Float64Array.from(u), v: Float64Array.from(v) };
  }

  clone(): GraphModel {
    return GraphModel.fromJSON(this.toJSON());
  }

  toJSON(): SerializedGraph {
    return {
      dots: this.dots.map(stripDotLines),
      lines: this.lines.map((line) => ({ ...line })),
      playingPoint: this.playingPoint,
    };
  }

  toGraphData(): GraphData {
    const playingPoint = this.playingPoint ?? this.findFirstPlayableDot();
    return {
      dots: this.dots.map(stripDotLines),
      lines: this.lines.map((line) => ({ ...line })),
      playingPoint,
    };
  }

  findFirstPlayableDot(): number {
    const index = this.dots.findIndex((dot) => !dot.fixed);
    return index >= 0 ? index : 0;
  }

  static fromJSON(payload: SerializedGraph): GraphModel {
    const graph = new GraphModel();
    graph.dots = payload.dots.map((dot) => ({ ...dot, lines: [] }));
    graph.lines = payload.lines.map((line) => ({ ...line }));
    graph.playingPoint = payload.playingPoint ?? null;
    graph.rebuildDotLines();
    return graph;
  }

  private rebuildDotLines(): void {
    this.dots = this.dots.map((dot) => ({ ...dot, lines: [] }));
    this.lines.forEach((line) => {
      this.dots[line.dot1]?.lines.push(line);
      this.dots[line.dot2]?.lines.push(line);
    });
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
