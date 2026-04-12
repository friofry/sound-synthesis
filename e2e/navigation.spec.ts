import { test, expect } from "@playwright/test";
import { switchToWindowPage } from "./helpers";

test.describe("Navigation", () => {
  test("app loads with menu bar and Membrane Modeller view", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("menubar", { name: "Application menu" })).toBeVisible();
    await expect(page.locator("canvas.graph-canvas")).toBeVisible();
    await expect(page.locator(".viewer-toolbar")).toBeVisible();
  });

  test("canvas is visible on the page", async ({ page }) => {
    await page.goto("/");
    const canvas = page.locator("canvas.graph-canvas");
    await expect(canvas).toBeVisible();
  });

  test("editor toolbar is visible", async ({ page }) => {
    await page.goto("/");
    const toolbar = page.locator("header.toolbar");
    await expect(toolbar).toBeVisible();
  });

  test("viewer toolbar is visible", async ({ page }) => {
    await page.goto("/");
    const toolbar = page.locator(".viewer-toolbar");
    await expect(toolbar).toBeVisible();
  });

  test("status bar is visible", async ({ page }) => {
    await page.goto("/");
    const statusBar = page.locator("footer.status-bar");
    await expect(statusBar).toBeVisible();
  });

  test("piano toolbar is visible in the piano panel", async ({ page }) => {
    await page.goto("/");
    const toolbar = page.locator(".piano-panel .piano-toolbar-panel");
    await expect(toolbar).toBeVisible();
  });

  test("can switch to Piano Player page and back via Window menu", async ({ page }) => {
    await page.goto("/");
    await switchToWindowPage(page, "Piano Player");
    await expect(page.locator(".piano-page")).toBeVisible();
    await expect(page.locator("canvas.graph-canvas")).toHaveCount(0);

    await switchToWindowPage(page, "Membrane Modeller");
    await expect(page.locator(".workspace-layout")).toBeVisible();
    await expect(page.locator("canvas.graph-canvas")).toBeVisible();
  });

  test("can open Gauss Noise page via Window menu", async ({ page }) => {
    await page.goto("/");
    await switchToWindowPage(page, "Gauss Noise");
    await expect(page.locator(".gauss-noise-page")).toBeVisible();
    await expect(page.getByRole("button", { name: "Generate" })).toBeVisible();
  });
});
