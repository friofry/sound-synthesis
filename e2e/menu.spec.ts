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
});
