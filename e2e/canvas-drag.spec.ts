import { test, expect } from "@playwright/test";
import { createPresetGrid, dragOnCanvas, getGraphState, selectTool } from "./helpers";

test.describe("Canvas - Drag and Zoom", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await createPresetGrid(page, "cell", 3, 3);
  });

  test("drag-point tool moves a dot", async ({ page }) => {
    const before = await getGraphState(page);
    const dot = before.dots[0];
    await selectTool(page, "Drag point");

    await dragOnCanvas(page, dot.x, dot.y, dot.x + 50, dot.y + 50);

    const after = await getGraphState(page);
    const movedDot = after.dots[0];
    expect(movedDot.x).not.toBe(dot.x);
    expect(movedDot.y).not.toBe(dot.y);
  });

  test("drag-viewport tool pans the viewport", async ({ page }) => {
    await selectTool(page, "Drag viewport");

    const before = await page.evaluate(() => ({
      ...window.__graphStore.getState().viewportOffset,
    }));

    await dragOnCanvas(page, 300, 300, 400, 400);

    const after = await page.evaluate(() => ({
      ...window.__graphStore.getState().viewportOffset,
    }));

    expect(after.x).not.toBe(before.x);
    expect(after.y).not.toBe(before.y);
  });

  test("mouse wheel zooms the viewport", async ({ page }) => {
    const canvas = page.locator("canvas.graph-canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    const before = await page.evaluate(() => window.__graphStore.getState().viewportScale);

    await page.mouse.move(box.x + 300, box.y + 300);
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(100);

    const after = await page.evaluate(() => window.__graphStore.getState().viewportScale);
    expect(after).not.toBe(before);
  });
});
