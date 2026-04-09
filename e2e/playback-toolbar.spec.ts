import { test, expect } from "@playwright/test";
import { createPresetGrid, clearGraph } from "./helpers";

test.describe("Viewer Toolbar", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("Play/Pause button is disabled when graph is empty", async ({ page }) => {
    await clearGraph(page);
    const btn = page.locator(".viewer-toolbar button").first();
    await expect(btn).toBeDisabled();
  });

  test("Stop button is disabled when graph is empty", async ({ page }) => {
    await clearGraph(page);
    const btn = page.locator(".viewer-toolbar button", { hasText: "Stop" });
    await expect(btn).toBeDisabled();
  });

  test("Play/Pause button is enabled after creating a graph", async ({ page }) => {
    await createPresetGrid(page, "cell", 3, 3);
    const btn = page.locator(".viewer-toolbar button").first();
    await expect(btn).toBeEnabled();
  });

  test("Stop button is enabled after creating a graph", async ({ page }) => {
    await createPresetGrid(page, "cell", 3, 3);
    const btn = page.locator(".viewer-toolbar button", { hasText: "Stop" });
    await expect(btn).toBeEnabled();
  });

  test("Play/Pause button toggles state on click", async ({ page }) => {
    await createPresetGrid(page, "cell", 3, 3);
    const playPauseBtn = page.locator(".viewer-toolbar button").first();
    const initialLabel = (await playPauseBtn.textContent())?.trim() ?? "";
    expect(["Play", "Pause"]).toContain(initialLabel);
    await playPauseBtn.click();
    const nextLabel = (await playPauseBtn.textContent())?.trim() ?? "";
    expect(nextLabel).not.toBe(initialLabel);
    expect(["Play", "Pause"]).toContain(nextLabel);
  });
});
