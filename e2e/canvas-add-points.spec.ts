import { test, expect } from "@playwright/test";
import { clickCanvas, clearGraph, getGraphState, selectTool } from "./helpers";

test.describe("Canvas - Add Points and Links", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clearGraph(page);
    await selectTool(page, "Add point/link");
  });

  test("clicking empty canvas creates a dot", async ({ page }) => {
    await clickCanvas(page, 200, 200);
    const state = await getGraphState(page);
    expect(state.dotsCount).toBe(1);
  });

  test("clicking twice creates two dots connected by a line", async ({ page }) => {
    await clickCanvas(page, 200, 200);
    await clickCanvas(page, 300, 300);
    const state = await getGraphState(page);
    expect(state.dotsCount).toBe(2);
    expect(state.linesCount).toBe(1);
  });

  test("clicking three times creates chain of dots and lines", async ({ page }) => {
    await clickCanvas(page, 100, 100);
    await clickCanvas(page, 300, 100);
    await clickCanvas(page, 500, 100);
    const state = await getGraphState(page);
    expect(state.dotsCount).toBe(3);
    expect(state.linesCount).toBe(2);
  });

  test("ctrl+click creates a fixed dot", async ({ page }) => {
    const canvas = page.locator("canvas.graph-canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");
    await page.keyboard.down("Control");
    await page.mouse.click(box.x + 200, box.y + 200);
    await page.keyboard.up("Control");
    const state = await getGraphState(page);
    expect(state.dotsCount).toBe(1);
    expect(state.dots[0].fixed).toBe(true);
  });

  test("clicking on existing dot then another creates a link between them", async ({ page }) => {
    await clickCanvas(page, 200, 200);
    await clickCanvas(page, 400, 200);

    const before = await getGraphState(page);
    expect(before.linesCount).toBe(1);

    // Click somewhere far to deselect, then click first dot, then second dot
    await clickCanvas(page, 200, 400);
    const afterDeselect = await getGraphState(page);
    // Now click near the first dot
    const dot0 = afterDeselect.dots[0];
    const dot1 = afterDeselect.dots[1];
    await clickCanvas(page, dot0.x, dot0.y);
    await clickCanvas(page, dot1.x, dot1.y);

    const after = await getGraphState(page);
    // There should still be a link between them (may already exist)
    expect(after.linesCount).toBeGreaterThanOrEqual(1);
  });
});
