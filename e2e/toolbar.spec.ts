import { test, expect } from "@playwright/test";
import { getStoreState, selectTool } from "./helpers";

test.describe("Editor Toolbar", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("Add point/link tool sets crosshair cursor", async ({ page }) => {
    await selectTool(page, "Add point/link");
    const canvas = page.locator("canvas.graph-canvas");
    await expect(canvas).toHaveCSS("cursor", "crosshair");
  });

  test("Delete point tool sets not-allowed cursor", async ({ page }) => {
    await selectTool(page, "Delete point");
    const canvas = page.locator("canvas.graph-canvas");
    await expect(canvas).toHaveCSS("cursor", "not-allowed");
  });

  test("Drag point tool sets grab cursor", async ({ page }) => {
    await selectTool(page, "Drag point");
    const canvas = page.locator("canvas.graph-canvas");
    await expect(canvas).toHaveCSS("cursor", "grab");
  });

  test("Drag viewport tool sets grab cursor", async ({ page }) => {
    await selectTool(page, "Drag viewport");
    const canvas = page.locator("canvas.graph-canvas");
    await expect(canvas).toHaveCSS("cursor", "grab");
  });

  test("Modify point tool sets context-menu cursor", async ({ page }) => {
    await selectTool(page, "Modify point");
    const canvas = page.locator("canvas.graph-canvas");
    await expect(canvas).toHaveCSS("cursor", "context-menu");
  });

  test("Playing point tool sets cell cursor", async ({ page }) => {
    await selectTool(page, "Playing point");
    const canvas = page.locator("canvas.graph-canvas");
    await expect(canvas).toHaveCSS("cursor", "cell");
  });

  test("tool selection updates store", async ({ page }) => {
    await selectTool(page, "Add point/link");
    let state = await getStoreState(page);
    expect(state.tool).toBe("add-point-link");

    await selectTool(page, "Delete point");
    state = await getStoreState(page);
    expect(state.tool).toBe("delete-point");

    await selectTool(page, "Modify link");
    state = await getStoreState(page);
    expect(state.tool).toBe("modify-link");
  });

  test("Zoom in button increases viewport scale", async ({ page }) => {
    const before = await page.evaluate(() => window.__graphStore.getState().viewportScale);
    await page.click('button[title="Zoom in"]');
    const after = await page.evaluate(() => window.__graphStore.getState().viewportScale);
    expect(after).toBeGreaterThan(before);
  });

  test("Zoom out button decreases viewport scale", async ({ page }) => {
    const before = await page.evaluate(() => window.__graphStore.getState().viewportScale);
    await page.click('button[title="Zoom out"]');
    const after = await page.evaluate(() => window.__graphStore.getState().viewportScale);
    expect(after).toBeLessThan(before);
  });

  test("Add cell graph button opens cell template dialog", async ({ page }) => {
    await page.click('button[title="Add cell graph"]');
    const dialog = page.locator(".mfc-window");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".mfc-title")).toHaveText("Cell template");
  });

  test("Add hexagonal graph button opens hex template dialog", async ({ page }) => {
    await page.click('button[title="Add hexagonal graph"]');
    const dialog = page.locator(".mfc-window");
    await expect(dialog).toBeVisible();
  });

  test("Load graph button imports legacy .gph files", async ({ page }) => {
    const fileBytes = createLegacyGphBuffer();
    await page.setInputFiles('input[accept=".gph,application/octet-stream"]', {
      name: "legacy.gph",
      mimeType: "application/octet-stream",
      buffer: Buffer.from(fileBytes),
    });

    const state = await page.evaluate(() => window.__graphStore.getState().serializeGraph());
    expect(state).toEqual({
      dots: [
        { x: 12, y: 34, u: 1.25, v: -2.5, weight: 0.5, fixed: false, inputFile: "old.wav" },
        { x: 56, y: 78, u: 3.5, v: 4.75, weight: 1.5, fixed: true, inputFile: null },
      ],
      lines: [{ dot1: 0, dot2: 1, k: 9.25 }],
      playingPoint: null,
    });
  });

  test("selected tool button has is-selected class", async ({ page }) => {
    await selectTool(page, "Add point/link");
    const btn = page.locator('button[aria-label="Add point/link"]');
    await expect(btn).toHaveClass(/is-selected/);
  });
});

function createLegacyGphBuffer(): Uint8Array {
  const totalBytes = 4 + (40 + 8) + (40 + 1) + (4 + 12) + (4 + 12);
  const bytes = new Uint8Array(totalBytes);
  const view = new DataView(bytes.buffer);
  let offset = 0;

  view.setInt32(offset, 2, true);
  offset += 4;

  offset = writeDot(bytes, view, offset, { x: 12, y: 34, weight: 0.5, v: -2.5, u: 1.25, fixed: false, inputFile: "old.wav" });
  offset = writeDot(bytes, view, offset, { x: 56, y: 78, weight: 1.5, v: 4.75, u: 3.5, fixed: true, inputFile: "" });

  view.setInt32(offset, 1, true);
  offset += 4;
  view.setInt32(offset, 1, true);
  offset += 4;
  view.setFloat64(offset, 9.25, true);
  offset += 8;

  view.setInt32(offset, 1, true);
  offset += 4;
  view.setInt32(offset, 0, true);
  offset += 4;
  view.setFloat64(offset, 9.25, true);

  return bytes;
}

function writeDot(
  bytes: Uint8Array,
  view: DataView,
  offset: number,
  dot: { x: number; y: number; weight: number; v: number; u: number; fixed: boolean; inputFile: string },
): number {
  const nameBytes = Buffer.from(`${dot.inputFile}\0`, "binary");
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
  return offset;
}
