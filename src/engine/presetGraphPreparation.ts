import { GraphModel } from "./graph";

export type DistributionMode = "equivalent" | "smoothed";
export type FixMode = "none" | "fix" | "unfix";
export type PlayingPointMode = "first-playable" | "center";

export type CenterGroupModifyOptions = {
  enabled: boolean;
  maxAmplitude: number;
  maxWeight: number;
  stiffness: number;
  distribution: DistributionMode;
  fixMode: FixMode;
};

export type PresetGraphPreparationOptions = {
  playingPointMode?: PlayingPointMode;
  centerGroup?: CenterGroupModifyOptions;
};

const CENTER_GROUP_AREA_RATIO = Math.sqrt(0.5);

export function preparePresetGraph(graph: GraphModel, options?: PresetGraphPreparationOptions): void {
  if (!options) {
    return;
  }

  if (options.centerGroup?.enabled) {
    applyCenteredGroupModify(graph, options.centerGroup);
  }

  graph.playingPoint = resolvePlayingPoint(graph, options.playingPointMode ?? "first-playable");
}

function applyCenteredGroupModify(graph: GraphModel, options: CenterGroupModifyOptions): void {
  const bounds = getGraphBounds(graph);
  if (!bounds) {
    return;
  }

  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const rectWidth = (bounds.maxX - bounds.minX) * CENTER_GROUP_AREA_RATIO;
  const rectHeight = (bounds.maxY - bounds.minY) * CENTER_GROUP_AREA_RATIO;
  const rect = {
    x1: centerX - rectWidth / 2,
    y1: centerY - rectHeight / 2,
    x2: centerX + rectWidth / 2,
    y2: centerY + rectHeight / 2,
  };
  const radius = Math.max(1, Math.hypot(rect.x2 - centerX, rect.y2 - centerY));

  const selected = graph.dots
    .map((dot, idx) => ({ dot, idx }))
    .filter(
      ({ dot }) =>
        dot.x >= Math.min(rect.x1, rect.x2) &&
        dot.x <= Math.max(rect.x1, rect.x2) &&
        dot.y >= Math.min(rect.y1, rect.y2) &&
        dot.y <= Math.max(rect.y1, rect.y2),
    );

  const selectedSet = new Set(selected.map(({ idx }) => idx));

  selected.forEach(({ dot, idx }) => {
    const dist = Math.hypot(dot.x - centerX, dot.y - centerY);
    const factor = options.distribution === "smoothed" ? Math.max(0, 1 - dist / radius) : 1;
    graph.setDotProps(idx, {
      u: options.maxAmplitude * factor,
      weight: options.maxWeight * Math.max(0.1, factor),
      fixed: options.fixMode === "none" ? dot.fixed : options.fixMode === "fix",
    });
  });

  for (const line of graph.lines) {
    if (selectedSet.has(line.dot1) && selectedSet.has(line.dot2)) {
      line.k = options.stiffness;
    }
  }
}

function resolvePlayingPoint(graph: GraphModel, mode: PlayingPointMode): number | null {
  const playableDots = graph.dots
    .map((dot, idx) => ({ dot, idx }))
    .filter(({ dot }) => !dot.fixed);

  if (!playableDots.length) {
    return null;
  }

  if (mode === "first-playable") {
    return playableDots[0].idx;
  }

  const bounds = getGraphBounds(graph);
  if (!bounds) {
    return playableDots[0].idx;
  }

  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  return playableDots.reduce(
    (best, entry) => {
      const distance = Math.hypot(entry.dot.x - centerX, entry.dot.y - centerY);
      return distance < best.distance ? { idx: entry.idx, distance } : best;
    },
    { idx: playableDots[0].idx, distance: Number.POSITIVE_INFINITY },
  ).idx;
}

function getGraphBounds(graph: GraphModel): { minX: number; maxX: number; minY: number; maxY: number } | null {
  if (!graph.dots.length) {
    return null;
  }

  return graph.dots.reduce(
    (acc, dot) => ({
      minX: Math.min(acc.minX, dot.x),
      maxX: Math.max(acc.maxX, dot.x),
      minY: Math.min(acc.minY, dot.y),
      maxY: Math.max(acc.maxY, dot.y),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    },
  );
}
