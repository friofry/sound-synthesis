import type { Page } from "@playwright/test";
import type { Dot, Line } from "../src/engine/types";

type GraphStoreSnapshot = {
  tool: string;
  viewportScale: number;
  viewportOffset: { x: number; y: number };
  cursor: { x: number; y: number };
  selectedDotA: number | null;
  selectedDotB: number | null;
  selectedLineIndex: number | null;
  hoveredDot: number | null;
  hoveredLineIndex: number | null;
  playingPoint: number | null;
  isSimulating: boolean;
  simulationDialogOpen: boolean;
  cellTemplateDialog: { open: boolean };
  hexTemplateDialog: { open: boolean };
  dotDialog: { open: boolean };
  lineDialog: { open: boolean };
  groupDialog: { open: boolean };
};

type GraphStateSnapshot = {
  dotsCount: number;
  linesCount: number;
  dots: Array<Pick<Dot, "x" | "y" | "fixed" | "weight" | "u" | "v">>;
  lines: Array<Pick<Line, "dot1" | "dot2" | "k">>;
};

export type DotSnapshot = Pick<Dot, "x" | "y" | "fixed" | "weight" | "u" | "v">;

type PreviewMetrics = {
  available: boolean;
  sequence: number;
  sampleRate: number | null;
  length: number;
  maxAbs: number;
  rms: number;
  nonZeroCount: number;
};

type HammerImpactSnapshot = {
  impactX: number;
  impactY: number;
  charge: number;
  radius: number;
};

type ViewerStatusSnapshot = {
  activeSource: string;
  playing: boolean;
  frameIndex: number;
};

type ViewerRuntimeSnapshot = {
  u: number[];
  v: number[];
};

declare global {
  interface Window {
    __graphStore: {
      getState: () => {
        tool: string;
        viewportScale: number;
        viewportOffset: { x: number; y: number };
        cursor: { x: number; y: number };
        selectedDotA: number | null;
        selectedDotB: number | null;
        selectedLineIndex: number | null;
        hoveredDot: number | null;
        hoveredLineIndex: number | null;
        playingPoint: number | null;
        isSimulating: boolean;
        simulationDialogOpen: boolean;
        cellTemplateDialog: { open: boolean };
        hexTemplateDialog: { open: boolean };
        dotDialog: { open: boolean };
        lineDialog: { open: boolean };
        groupDialog: { open: boolean };
        canvasSize: { width: number; height: number };
        graph: { dots: Dot[]; lines: Line[] };
        createPresetGraph: (type: string, params: Record<string, unknown>) => void;
        clearGraph: () => void;
      };
      setState: (partial: unknown) => void;
    };
    __e2eHarness: {
      clearHammerPreview: () => void;
      getHammerPreviewMetrics: () => PreviewMetrics;
      getLastHammerImpact: () => HammerImpactSnapshot | null;
      getEditorGraphDots: () => DotSnapshot[];
      getViewerSnapshotDots: () => DotSnapshot[];
      getViewerStatus: () => ViewerStatusSnapshot;
      getViewerRuntimeState: () => ViewerRuntimeSnapshot | null;
      getPianoActiveBufferInfo: () => { length: number; sampleRate: number };
    };
  }
}

export async function getStoreState(page: Page): Promise<GraphStoreSnapshot> {
  return page.evaluate<GraphStoreSnapshot>(() => {
    const state = window.__graphStore.getState();
    return {
      tool: state.tool,
      viewportScale: state.viewportScale,
      viewportOffset: { ...state.viewportOffset },
      cursor: { ...state.cursor },
      selectedDotA: state.selectedDotA,
      selectedDotB: state.selectedDotB,
      selectedLineIndex: state.selectedLineIndex,
      hoveredDot: state.hoveredDot,
      hoveredLineIndex: state.hoveredLineIndex,
      playingPoint: state.playingPoint,
      isSimulating: state.isSimulating,
      simulationDialogOpen: state.simulationDialogOpen,
      cellTemplateDialog: { open: state.cellTemplateDialog.open },
      hexTemplateDialog: { open: state.hexTemplateDialog.open },
      dotDialog: { open: state.dotDialog.open },
      lineDialog: { open: state.lineDialog.open },
      groupDialog: { open: state.groupDialog.open },
    };
  });
}

export async function getGraphState(page: Page): Promise<GraphStateSnapshot> {
  return page.evaluate<GraphStateSnapshot>(() => {
    const { graph } = window.__graphStore.getState();
    return {
      dotsCount: graph.dots.length,
      linesCount: graph.lines.length,
      dots: graph.dots.map((dot) => ({ x: dot.x, y: dot.y, fixed: dot.fixed, weight: dot.weight, u: dot.u, v: dot.v })),
      lines: graph.lines.map((line) => ({ dot1: line.dot1, dot2: line.dot2, k: line.k })),
    };
  });
}

export async function selectTool(page: Page, toolLabel: string): Promise<void> {
  await page.click(`button[aria-label="${toolLabel}"]`);
}

export async function clickCanvas(page: Page, x: number, y: number, options?: { modifiers?: string[] }): Promise<void> {
  const point = await getCanvasScreenPoint(page, x, y);
  const modifiers = (options?.modifiers ?? []) as Array<"Alt" | "Control" | "Meta" | "Shift">;
  await page.mouse.click(point.clientX, point.clientY, { modifiers });
}

export async function dragOnCanvas(
  page: Page,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): Promise<void> {
  const fromPoint = await getCanvasScreenPoint(page, fromX, fromY);
  const toPoint = await getCanvasScreenPoint(page, toX, toY);
  await page.mouse.move(fromPoint.clientX, fromPoint.clientY);
  await page.mouse.down();
  await page.mouse.move(toPoint.clientX, toPoint.clientY, { steps: 10 });
  await page.mouse.up();
}

export async function moveOnCanvas(page: Page, x: number, y: number): Promise<void> {
  const point = await getCanvasScreenPoint(page, x, y);
  await page.mouse.move(point.clientX, point.clientY);
}

export async function createPresetGrid(
  page: Page,
  type: string = "cell",
  n: number = 3,
  m: number = 3,
): Promise<void> {
  const canvas = page.locator("canvas.graph-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas not found");
  const width = Math.max(200, Math.round(box.width));
  const height = Math.max(200, Math.round(box.height));
  await page.evaluate(
    ({ type, n, m, width, height }) => {
      const state = window.__graphStore.getState();
      state.createPresetGraph(type, {
        n,
        m,
        layers: 1,
        stiffness: 1,
        weight: 0.000001,
        stiffnessType: "isotropic",
        width,
        height,
        boundaryMode: "free",
      });
    },
    { type, n, m, width, height },
  );
}

export async function clearGraph(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__graphStore.getState().clearGraph();
  });
}

export async function rightClickCanvas(page: Page, x: number, y: number): Promise<void> {
  const point = await getCanvasScreenPoint(page, x, y);
  await page.mouse.click(point.clientX, point.clientY, { button: "right" });
}

async function getCanvasScreenPoint(page: Page, worldX: number, worldY: number): Promise<{ clientX: number; clientY: number }> {
  const viewport = await page.evaluate(() => {
    const state = window.__graphStore.getState();
    return {
      scale: state.viewportScale,
      offsetX: state.viewportOffset.x,
      offsetY: state.viewportOffset.y,
    };
  });
  const canvas = page.locator("canvas.graph-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas not found");
  const screenX = worldX * viewport.scale + viewport.offsetX;
  const screenY = worldY * viewport.scale + viewport.offsetY;
  const clampedX = Math.min(Math.max(1, screenX), Math.max(1, box.width - 1));
  const clampedY = Math.min(Math.max(1, screenY), Math.max(1, box.height - 1));
  return { clientX: box.x + clampedX, clientY: box.y + clampedY };
}

export async function switchToWindowPage(page: Page, label: "Membrane Modeller" | "Piano Player"): Promise<void> {
  await page.click('.mfc-menu-root-button:text("Window")');
  await page.getByRole("menuitem", { name: label }).click();
}

export async function clearHammerPreview(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__e2eHarness.clearHammerPreview();
  });
}

export async function waitForE2EHarness(page: Page): Promise<void> {
  await page.waitForFunction(() => Boolean(window.__e2eHarness), undefined, { timeout: 10_000 });
}

export async function getHammerPreviewMetrics(page: Page): Promise<PreviewMetrics> {
  return page.evaluate(() => window.__e2eHarness.getHammerPreviewMetrics());
}

export async function getLastHammerImpact(page: Page): Promise<HammerImpactSnapshot | null> {
  return page.evaluate(() => window.__e2eHarness.getLastHammerImpact());
}

export async function getViewerStatus(page: Page): Promise<ViewerStatusSnapshot> {
  return page.evaluate(() => window.__e2eHarness.getViewerStatus());
}

export async function getViewerSnapshotDots(page: Page): Promise<DotSnapshot[]> {
  return page.evaluate(() => window.__e2eHarness.getViewerSnapshotDots());
}

export async function getViewerRuntimeState(page: Page): Promise<ViewerRuntimeSnapshot | null> {
  return page.evaluate(() => window.__e2eHarness.getViewerRuntimeState());
}

export async function getPianoActiveBufferInfo(page: Page): Promise<{ length: number; sampleRate: number }> {
  return page.evaluate(() => window.__e2eHarness.getPianoActiveBufferInfo());
}

export function estimateRandomCenter(dots: DotSnapshot[]): { x: number; y: number } {
  let sumWeight = 0;
  let sumX = 0;
  let sumY = 0;

  for (const dot of dots) {
    const magnitude = Math.abs(dot.u);
    if (magnitude <= 1e-8) {
      continue;
    }
    sumWeight += magnitude;
    sumX += dot.x * magnitude;
    sumY += dot.y * magnitude;
  }

  if (sumWeight <= 1e-10) {
    return { x: 0, y: 0 };
  }

  return { x: sumX / sumWeight, y: sumY / sumWeight };
}

export function estimateRandomRadius(
  dots: DotSnapshot[],
  center: { x: number; y: number },
  thresholdRatio: number = 0.2,
): number {
  let maxAbsU = 0;
  for (const dot of dots) {
    const absU = Math.abs(dot.u);
    if (absU > maxAbsU) {
      maxAbsU = absU;
    }
  }
  if (maxAbsU <= 1e-10) {
    return 0;
  }
  const threshold = maxAbsU * thresholdRatio;
  let radius = 0;
  for (const dot of dots) {
    const absU = Math.abs(dot.u);
    if (absU < threshold) {
      continue;
    }
    const dist = Math.hypot(dot.x - center.x, dot.y - center.y);
    if (dist > radius) {
      radius = dist;
    }
  }
  return radius;
}

export function chooseHammerPointOutsideRandomZone(
  dots: DotSnapshot[],
  randomCenter: { x: number; y: number },
  minDistanceFromRandomCenter: number,
): { x: number; y: number } {
  let bestDot: DotSnapshot | null = null;
  let bestDistance = Number.NEGATIVE_INFINITY;

  for (const dot of dots) {
    if (dot.fixed) {
      continue;
    }
    const distance = Math.hypot(dot.x - randomCenter.x, dot.y - randomCenter.y);
    if (distance > bestDistance && distance >= minDistanceFromRandomCenter) {
      bestDistance = distance;
      bestDot = dot;
    }
  }

  if (bestDot) {
    return { x: bestDot.x, y: bestDot.y };
  }

  // Fallback: farthest playable dot even if it violates threshold.
  let fallback = dots.find((dot) => !dot.fixed) ?? dots[0];
  let fallbackDist = Number.NEGATIVE_INFINITY;
  for (const dot of dots) {
    if (dot.fixed) {
      continue;
    }
    const distance = Math.hypot(dot.x - randomCenter.x, dot.y - randomCenter.y);
    if (distance > fallbackDist) {
      fallbackDist = distance;
      fallback = dot;
    }
  }
  if (!fallback) {
    throw new Error("No dots available to place hammer impact");
  }
  return { x: fallback.x, y: fallback.y };
}

export async function hammerStrikeOnCanvas(
  page: Page,
  worldPoint: { x: number; y: number },
  holdMs: number = 300,
): Promise<{ x: number; y: number }> {
  const viewport = await page.evaluate(() => {
    const state = window.__graphStore.getState();
    return {
      scale: state.viewportScale,
      offsetX: state.viewportOffset.x,
      offsetY: state.viewportOffset.y,
    };
  });
  const canvas = page.locator("canvas.graph-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas not found");
  const screenX = worldPoint.x * viewport.scale + viewport.offsetX;
  const screenY = worldPoint.y * viewport.scale + viewport.offsetY;
  const clampedX = Math.min(Math.max(1, screenX), Math.max(1, box.width - 1));
  const clampedY = Math.min(Math.max(1, screenY), Math.max(1, box.height - 1));
  await canvas.evaluate(
    async (node, payload) => {
      const rect = node.getBoundingClientRect();
      const clientX = rect.left + payload.x;
      const clientY = rect.top + payload.y;
      node.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX, clientY, button: 0 }));
      node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, clientX, clientY, button: 0 }));
      await new Promise((resolve) => {
        window.setTimeout(resolve, payload.holdMs);
      });
      node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX, clientY, button: 0 }));
    },
    { x: clampedX, y: clampedY, holdMs },
  );
  return {
    x: (clampedX - viewport.offsetX) / viewport.scale,
    y: (clampedY - viewport.offsetY) / viewport.scale,
  };
}

export function collectZoneMetrics(options: {
  dots: DotSnapshot[];
  values: number[];
  hammerCenter: { x: number; y: number };
  hammerRadius: number;
  randomCenter: { x: number; y: number };
  randomRadius: number;
  epsilon?: number;
}): {
  hammer: { nonZeroCount: number; maxAbs: number };
  random: { nonZeroCount: number; maxAbs: number };
  outside: { nonZeroCount: number; maxAbs: number };
} {
  const epsilon = options.epsilon ?? 1e-6;
  const metrics = {
    hammer: { nonZeroCount: 0, maxAbs: 0 },
    random: { nonZeroCount: 0, maxAbs: 0 },
    outside: { nonZeroCount: 0, maxAbs: 0 },
  };

  for (let index = 0; index < options.dots.length; index += 1) {
    const dot = options.dots[index];
    const value = options.values[index] ?? 0;
    const absValue = Math.abs(value);
    const inHammer = Math.hypot(dot.x - options.hammerCenter.x, dot.y - options.hammerCenter.y) <= options.hammerRadius;
    const inRandom = Math.hypot(dot.x - options.randomCenter.x, dot.y - options.randomCenter.y) <= options.randomRadius;
    const bucket = inHammer ? metrics.hammer : inRandom ? metrics.random : metrics.outside;
    if (absValue > bucket.maxAbs) {
      bucket.maxAbs = absValue;
    }
    if (absValue > epsilon) {
      bucket.nonZeroCount += 1;
    }
  }

  return metrics;
}
