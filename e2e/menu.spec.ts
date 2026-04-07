import { expect, test } from "@playwright/test";
import { clearGraph, getGraphState, getStoreState } from "./helpers";

test.describe("MfcMenu", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await clearGraph(page);
  });

  test("Graph menu opens and shows Insert Graph item", async ({ page }) => {
    await page.click(".mfc-menu-root-button:text('Graph')");

    const dropdown = page.locator(".mfc-menu-dropdown").first();
    await expect(dropdown).toBeVisible();
    await expect(dropdown.getByRole("menuitem", { name: "Insert Graph..." })).toBeVisible();
  });

  test("Graph > Insert Graph opens and cancel closes dialog", async ({ page }) => {
    await page.click(".mfc-menu-root-button:text('Graph')");
    const dropdown = page.locator(".mfc-menu-dropdown").first();
    const insertGraphItem = dropdown.getByRole("menuitem", { name: "Insert Graph..." });
    await expect(insertGraphItem).toBeVisible();
    await insertGraphItem.click();

    const dialog = page.locator(".mfc-window");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".mfc-title")).toHaveText("Insert Graph Dialog");

    await dialog.locator("button:text('Cancel')").click();
    await expect(dialog).not.toBeVisible();
  });

  test("Graph > Insert Graph and OK creates preset graph", async ({ page }) => {
    await page.click(".mfc-menu-root-button:text('Graph')");
    const dropdown = page.locator(".mfc-menu-dropdown").first();
    const insertGraphItem = dropdown.getByRole("menuitem", { name: "Insert Graph..." });
    await expect(insertGraphItem).toBeVisible();
    await insertGraphItem.click();

    const dialog = page.locator(".mfc-window");
    await expect(dialog).toBeVisible();

    await dialog.locator("button:text('OK')").click();
    await expect(dialog).not.toBeVisible();

    const graph = await getGraphState(page);
    const store = await getStoreState(page);
    expect(graph.dotsCount).toBeGreaterThan(0);
    expect(graph.linesCount).toBeGreaterThan(0);
    expect(store.playingPoint).not.toBeNull();
    expect(graph.dots.some((dot) => dot.u > 0)).toBe(true);
  });

  test("Graph > Community graphs opens dialog with entries", async ({ page }) => {
    await page.click(".mfc-menu-root-button:text('Graph')");
    const dropdown = page.locator(".mfc-menu-dropdown").first();
    const browseItem = dropdown.getByRole("menuitem", { name: "Community graphs..." });
    await expect(browseItem).toBeVisible();
    await browseItem.click();

    const dialog = page.locator(".mfc-window");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".mfc-title")).toHaveText("Browse community graphs");
    await expect(dialog.locator(".mfc-list-view-item").first()).toBeVisible();

    await dialog.locator("button:text('Close')").click();
    await expect(dialog).not.toBeVisible();
  });

  test("Graph > Community graphs loads a legacy community graph", async ({ page }) => {
    await page.click(".mfc-menu-root-button:text('Graph')");
    const dropdown = page.locator(".mfc-menu-dropdown").first();
    const browseItem = dropdown.getByRole("menuitem", { name: "Community graphs..." });
    await expect(browseItem).toBeVisible();
    await browseItem.click();

    const dialog = page.locator(".mfc-window");
    await expect(dialog).toBeVisible();

    const drumItem = dialog.locator(".mfc-list-view-item", { hasText: "drum.gph" }).first();
    await expect(drumItem).toBeVisible();
    await drumItem.click();
    await expect(dialog).not.toBeVisible();

    const graph = await getGraphState(page);
    expect(graph.dotsCount).toBe(49);
    expect(graph.linesCount).toBeGreaterThan(0);
    expect(graph.dots.some((dot) => dot.fixed)).toBe(true);
    expect(graph.dots.every((dot) => Number.isFinite(dot.x) && Number.isFinite(dot.y))).toBe(true);
  });
});
