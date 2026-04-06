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

  test("selected tool button has is-selected class", async ({ page }) => {
    await selectTool(page, "Add point/link");
    const btn = page.locator('button[aria-label="Add point/link"]');
    await expect(btn).toHaveClass(/is-selected/);
  });
});
