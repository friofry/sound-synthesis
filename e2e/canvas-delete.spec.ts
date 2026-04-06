import { test, expect } from "@playwright/test";
import { clickCanvas, createPresetGrid, getGraphState, selectTool } from "./helpers";

test.describe("Canvas - Delete Points and Links", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await createPresetGrid(page, "cell", 3, 3);
  });

  test("delete-point tool removes a dot on click", async ({ page }) => {
    const before = await getGraphState(page);
    await selectTool(page, "Delete point");

    // Click on the first dot's position
    const dot = before.dots[0];
    await clickCanvas(page, dot.x, dot.y);

    const after = await getGraphState(page);
    expect(after.dotsCount).toBeLessThan(before.dotsCount);
  });

  test("delete-link tool removes a line when clicking near it", async ({ page }) => {
    const before = await getGraphState(page);
    expect(before.linesCount).toBeGreaterThan(0);

    await selectTool(page, "Delete link");

    // Click first dot, then second dot of the first line to delete it
    const line = before.lines[0];
    const dot1 = before.dots[line.dot1];
    const dot2 = before.dots[line.dot2];

    await clickCanvas(page, dot1.x, dot1.y);
    await clickCanvas(page, dot2.x, dot2.y);

    const after = await getGraphState(page);
    expect(after.linesCount).toBeLessThan(before.linesCount);
  });

  test("deleting a point also removes connected lines", async ({ page }) => {
    const before = await getGraphState(page);
    await selectTool(page, "Delete point");

    // Delete the first dot (which has connected lines)
    const dot = before.dots[0];
    await clickCanvas(page, dot.x, dot.y);

    const after = await getGraphState(page);
    expect(after.dotsCount).toBe(before.dotsCount - 1);
    expect(after.linesCount).toBeLessThan(before.linesCount);
  });
});
