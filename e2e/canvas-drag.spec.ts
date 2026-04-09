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
    const canvas = page.locator("canvas.graph-canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");

    const before = await page.evaluate(() => ({
      ...window.__graphStore.getState().viewportOffset,
    }));

    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 80, startY + 80, { steps: 10 });
    await page.mouse.up();

    const after = await page.evaluate(() => ({
      ...window.__graphStore.getState().viewportOffset,
    }));

    expect(after.x).not.toBe(before.x);
    expect(after.y).not.toBe(before.y);
  });

  test("mouse wheel zooms the viewport", async ({ page }) => {
    const canvas = page.locator("canvas.graph-canvas");
    const before = await page.evaluate(() => window.__graphStore.getState().viewportScale);
    await canvas.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const clientX = rect.left + rect.width / 2;
      const clientY = rect.top + rect.height / 2;
      node.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          deltaY: -100,
          clientX,
          clientY,
        }),
      );
    });
    await page.waitForTimeout(100);

    const after = await page.evaluate(() => window.__graphStore.getState().viewportScale);
    expect(after).not.toBe(before);
  });
});
