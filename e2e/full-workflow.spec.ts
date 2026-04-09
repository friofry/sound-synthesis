import { test, expect } from "@playwright/test";
import { getGraphState, clearGraph } from "./helpers";

test.describe("Full Workflow", () => {
  test("create grid via cell template, set playing point, run simulation", async ({ page }) => {
    await page.goto("/");
    await clearGraph(page);

    // Step 1: Open cell template dialog
    await page.click('button[title="Add cell graph"]');
    const templateDialog = page.locator(".mfc-window");
    await expect(templateDialog).toBeVisible();
    await expect(templateDialog.locator(".mfc-title")).toHaveText("Cell template");

    // Step 2: Apply with defaults (3x3 grid)
    await templateDialog.locator("button:text('OK')").click();
    await expect(templateDialog).not.toBeVisible();

    // Step 3: Verify graph was created
    const graphState = await getGraphState(page);
    expect(graphState.dotsCount).toBeGreaterThan(0);
    expect(graphState.linesCount).toBeGreaterThan(0);

    // Step 4: Verify a playing point was set
    const playingPoint = await page.evaluate(() => window.__graphStore.getState().playingPoint);
    expect(playingPoint).not.toBeNull();

    // Step 5: Open simulation dialog
    await page.evaluate(() => {
      window.__graphStore.getState().openSimulationDialog();
    });

    const simDialog = page.locator(".mfc-window");
    await expect(simDialog).toBeVisible();
    await expect(simDialog.locator(".mfc-title")).toHaveText("Simulation Output");

    // Step 6: Switch to full output and run simulation
    await simDialog.locator("text=Full frames (viewer replay)").click();
    await simDialog.locator("button:text('Run Full Simulation')").click();

    // Step 7: Wait for simulation to complete (dialog should close)
    await expect(simDialog).not.toBeVisible({ timeout: 30_000 });

    // Step 8: Verify simulation completed
    const simResult = await page.evaluate(() => {
      const state = window.__graphStore.getState();
      return {
        isSimulating: state.isSimulating,
        hasResult: state.simulationResult !== null,
      };
    });
    expect(simResult.isSimulating).toBe(false);
    expect(simResult.hasResult).toBe(true);

    // Step 9: Viewer Play button should now be enabled
    const playBtn = page.locator(".viewer-toolbar button", { hasText: "Play" });
    await expect(playBtn).toBeEnabled();
  });

  test("create grid, delete a dot, verify graph consistency", async ({ page }) => {
    await page.goto("/");
    await clearGraph(page);

    // Create a grid via store
    await page.evaluate(() => {
      window.__graphStore.getState().createPresetGraph("cell", {
        n: 3,
        m: 3,
        layers: 1,
        stiffness: 1,
        weight: 0.000001,
        stiffnessType: "isotropic",
        width: 1200,
        height: 700,
        boundaryMode: "free",
      });
    });

    const before = await getGraphState(page);
    expect(before.dotsCount).toBe(9);

    // Switch to delete point tool
    await page.click('button[title="Delete point"]');

    // Delete a corner dot
    const canvas = page.locator("canvas.graph-canvas");
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Canvas not found");
    const dot = before.dots[0];
    await page.mouse.click(box.x + dot.x, box.y + dot.y);

    const after = await getGraphState(page);
    expect(after.dotsCount).toBe(8);
    expect(after.linesCount).toBeLessThan(before.linesCount);
  });

  test("zoom in then zoom out returns to roughly original scale", async ({ page }) => {
    await page.goto("/");

    const initial = await page.evaluate(() => window.__graphStore.getState().viewportScale);

    // Zoom in 3 times
    for (let i = 0; i < 3; i++) {
      await page.click('button[title="Zoom in"]');
    }
    const zoomed = await page.evaluate(() => window.__graphStore.getState().viewportScale);
    expect(zoomed).toBeGreaterThan(initial);

    // Zoom out 3 times
    for (let i = 0; i < 3; i++) {
      await page.click('button[title="Zoom out"]');
    }
    const restored = await page.evaluate(() => window.__graphStore.getState().viewportScale);
    // Should be approximately back to initial (within floating point tolerance)
    expect(Math.abs(restored - initial)).toBeLessThan(0.01);
  });
});
