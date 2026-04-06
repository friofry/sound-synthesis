import type { Page } from "@playwright/test";

declare global {
  interface Window {
    __graphStore: {
      getState: () => any;
      setState: (partial: any) => void;
    };
  }
}

export async function getStoreState(page: Page): Promise<any> {
  return page.evaluate(() => {
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

export async function getGraphState(page: Page): Promise<{ dotsCount: number; linesCount: number; dots: any[]; lines: any[] }> {
  return page.evaluate(() => {
    const { graph } = window.__graphStore.getState();
    return {
      dotsCount: graph.dots.length,
      linesCount: graph.lines.length,
      dots: graph.dots.map((d: any) => ({ x: d.x, y: d.y, fixed: d.fixed, weight: d.weight, u: d.u, v: d.v })),
      lines: graph.lines.map((l: any) => ({ dot1: l.dot1, dot2: l.dot2, k: l.k })),
    };
  });
}

export async function selectTool(page: Page, toolLabel: string): Promise<void> {
  await page.click(`button[aria-label="${toolLabel}"]`);
}

export async function clickCanvas(page: Page, x: number, y: number, options?: { modifiers?: string[] }): Promise<void> {
  const canvas = page.locator("canvas.graph-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas not found");
  const modifiers = (options?.modifiers ?? []) as Array<"Alt" | "Control" | "Meta" | "Shift">;
  await page.mouse.click(box.x + x, box.y + y, { modifiers });
}

export async function dragOnCanvas(
  page: Page,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): Promise<void> {
  const canvas = page.locator("canvas.graph-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas not found");
  await page.mouse.move(box.x + fromX, box.y + fromY);
  await page.mouse.down();
  await page.mouse.move(box.x + toX, box.y + toY, { steps: 10 });
  await page.mouse.up();
}

export async function moveOnCanvas(page: Page, x: number, y: number): Promise<void> {
  const canvas = page.locator("canvas.graph-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas not found");
  await page.mouse.move(box.x + x, box.y + y);
}

export async function createPresetGrid(
  page: Page,
  type: string = "cell",
  n: number = 3,
  m: number = 3,
): Promise<void> {
  await page.evaluate(
    ({ type, n, m }) => {
      window.__graphStore.getState().createPresetGraph(type, {
        n,
        m,
        layers: 1,
        stiffness: 1,
        weight: 0.000001,
        fixedBorder: false,
        stiffnessType: "isotropic",
        width: 1200,
        height: 700,
      });
    },
    { type, n, m },
  );
}

export async function clearGraph(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__graphStore.getState().clearGraph();
  });
}

export async function rightClickCanvas(page: Page, x: number, y: number): Promise<void> {
  const canvas = page.locator("canvas.graph-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas not found");
  await page.mouse.click(box.x + x, box.y + y, { button: "right" });
}

export async function switchToWindowPage(page: Page, label: "Membrane Modeller" | "Piano Player"): Promise<void> {
  await page.click('.mfc-menu-root-button:text("Window")');
  await page.getByRole("menuitem", { name: label }).click();
}
