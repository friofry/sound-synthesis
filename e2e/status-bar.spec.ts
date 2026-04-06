import { test, expect } from "@playwright/test";
import { createPresetGrid, moveOnCanvas, clickCanvas, selectTool, clearGraph } from "./helpers";

test.describe("Status Bar", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("status bar shows cursor coordinates on mouse move", async ({ page }) => {
    await clearGraph(page);
    await selectTool(page, "Drag point");
    const statusBar = page.locator("footer.status-bar");

    await moveOnCanvas(page, 150, 120);
    await page.waitForTimeout(100);

    const text = await statusBar.textContent();
    expect(text).toMatch(/\d+ : \d+/);
  });

  test("status bar updates when mouse moves to different position", async ({ page }) => {
    await clearGraph(page);
    await selectTool(page, "Drag point");
    const statusBar = page.locator("footer.status-bar");

    await moveOnCanvas(page, 100, 100);
    await page.waitForTimeout(100);
    const text1 = await statusBar.textContent();

    await moveOnCanvas(page, 300, 250);
    await page.waitForTimeout(100);
    const text2 = await statusBar.textContent();

    expect(text1).not.toBe(text2);
  });

  test("status bar shows dot info on hover over a dot", async ({ page }) => {
    await createPresetGrid(page, "cell", 3, 3);
    await selectTool(page, "Drag point");
    const statusBar = page.locator("footer.status-bar");

    const dotPos = await page.evaluate(() => {
      const { graph } = window.__graphStore.getState();
      const d = graph.dots[0];
      return { x: d.x, y: d.y };
    });

    await moveOnCanvas(page, dotPos.x, dotPos.y);
    await page.waitForTimeout(100);

    const text = await statusBar.textContent();
    expect(text).toMatch(/dot\[/);
  });

  test("status bar shows line info on hover over a line", async ({ page }) => {
    // Use a 2x2 grid for wider dot spacing to ensure line midpoints are far from dots
    await createPresetGrid(page, "cell", 2, 2);
    await selectTool(page, "Drag point");
    const statusBar = page.locator("footer.status-bar");

    // Find the midpoint of a horizontal or vertical line that's far from all dots
    const linePos = await page.evaluate(() => {
      const { graph } = window.__graphStore.getState();
      for (const line of graph.lines) {
        const d1 = graph.dots[line.dot1];
        const d2 = graph.dots[line.dot2];
        const midX = (d1.x + d2.x) / 2;
        const midY = (d1.y + d2.y) / 2;
        // Check that the midpoint is far from ALL dots
        const tooClose = graph.dots.some(
          (d: any) => Math.hypot(midX - d.x, midY - d.y) < 15,
        );
        if (!tooClose) {
          return { x: Math.round(midX), y: Math.round(midY) };
        }
      }
      return null;
    });

    if (linePos) {
      await moveOnCanvas(page, linePos.x, linePos.y);
      await page.waitForTimeout(100);
      const text = await statusBar.textContent();
      expect(text).toMatch(/line\[/);
    } else {
      // If no suitable line midpoint found, skip gracefully
      test.skip();
    }
  });
});
