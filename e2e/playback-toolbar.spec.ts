import { test, expect } from "@playwright/test";
import { createPresetGrid, clearGraph } from "./helpers";

test.describe("Viewer Toolbar", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("Play button is disabled when graph is empty", async ({ page }) => {
    await clearGraph(page);
    const btn = page.locator(".viewer-toolbar button", { hasText: "Play" });
    await expect(btn).toBeDisabled();
  });

  test("Stop button is disabled when graph is empty", async ({ page }) => {
    await clearGraph(page);
    const btn = page.locator(".viewer-toolbar button", { hasText: "Stop" });
    await expect(btn).toBeDisabled();
  });

  test("Play button is enabled after creating a graph", async ({ page }) => {
    await createPresetGrid(page, "cell", 3, 3);
    const btn = page.locator(".viewer-toolbar button", { hasText: "Play" });
    await expect(btn).toBeEnabled();
  });

  test("Stop button is enabled after creating a graph", async ({ page }) => {
    await createPresetGrid(page, "cell", 3, 3);
    const btn = page.locator(".viewer-toolbar button", { hasText: "Stop" });
    await expect(btn).toBeEnabled();
  });

  test("Play button toggles to Pause while playing", async ({ page }) => {
    await createPresetGrid(page, "cell", 3, 3);
    const playPauseBtn = page.locator(".viewer-toolbar button").first();
    await expect(playPauseBtn).toHaveText("Play");
    await playPauseBtn.click();

    await expect(playPauseBtn).toHaveText("Pause");
  });
});
