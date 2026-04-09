import { test, expect, type Page } from "@playwright/test";
import { clickCanvas, createPresetGrid, dragOnCanvas, getGraphState, selectTool } from "./helpers";

test.describe("Dialogs", () => {
  const dialogByTitle = (page: Page, title: string) => page.locator(`.mfc-window:has(.mfc-title:has-text("${title}"))`);
  const pickEditableDot = (dots: Array<{ x: number; y: number; fixed: boolean }>) => {
    const dot = dots.find((candidate) => !candidate.fixed) ?? dots[Math.floor(dots.length / 2)];
    if (!dot) {
      throw new Error("Preset graph has no dots");
    }
    return dot;
  };

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("right-click on a dot opens DotPropertiesDialog", async ({ page }) => {
    await createPresetGrid(page, "cell", 3, 3);
    const state = await getGraphState(page);
    const dot = pickEditableDot(state.dots);
    await page.evaluate(() => {
      window.__graphStore.getState().resetViewport();
    });
    const canvas = page.locator("canvas.graph-canvas");
    const candidates = [
      { x: Math.round(dot.x), y: Math.round(dot.y) },
      { x: Math.round(dot.x) + 2, y: Math.round(dot.y) + 2 },
      { x: Math.round(dot.x) - 2, y: Math.round(dot.y) - 2 },
    ];

    const dialog = dialogByTitle(page, "Point parameters");
    for (const candidate of candidates) {
      await canvas.click({
        button: "right",
        position: { x: candidate.x, y: candidate.y },
      });
      if (await dialog.isVisible()) {
        break;
      }
    }
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".mfc-title")).toHaveText("Point parameters");
  });

  test("DotPropertiesDialog shows weight, velocity, position fields", async ({ page }) => {
    await createPresetGrid(page, "cell", 3, 3);
    await page.evaluate(() => {
      const state = window.__graphStore.getState() as {
        graph: { dots: Array<{ fixed: boolean }> };
        openDotDialog: (dotIndex: number) => void;
      };
      const dotIndex = state.graph.dots.findIndex((candidate) => !candidate.fixed);
      state.openDotDialog(dotIndex >= 0 ? dotIndex : 0);
    });

    const dialog = dialogByTitle(page, "Point parameters");
    await expect(dialog.locator("text=weight")).toBeVisible();
    await expect(dialog.locator("text=velocity")).toBeVisible();
    await expect(dialog.locator("text=position")).toBeVisible();
  });

  test("DotPropertiesDialog OK applies changes", async ({ page }) => {
    await createPresetGrid(page, "cell", 3, 3);
    await page.evaluate(() => {
      const state = window.__graphStore.getState() as {
        graph: { dots: Array<{ fixed: boolean }> };
        openDotDialog: (dotIndex: number) => void;
      };
      const dotIndex = state.graph.dots.findIndex((candidate) => !candidate.fixed);
      state.openDotDialog(dotIndex >= 0 ? dotIndex : 0);
    });

    const dialog = dialogByTitle(page, "Point parameters");
    await expect(dialog).toBeVisible();

    // Check the Fixed checkbox
    const fixedCheckbox = dialog.locator('input[type="checkbox"]');
    await fixedCheckbox.check();

    await dialog.locator("button:text('OK')").click();
    await expect(dialog).not.toBeVisible();

    const after = await getGraphState(page);
    expect(after.dots[0].fixed).toBe(true);
  });

  test("DotPropertiesDialog Cancel discards changes", async ({ page }) => {
    await createPresetGrid(page, "cell", 3, 3);
    const state = await getGraphState(page);
    const dot = pickEditableDot(state.dots);
    const wasFix = dot.fixed;

    await page.evaluate(() => {
      const store = window.__graphStore.getState() as {
        graph: { dots: Array<{ fixed: boolean }> };
        openDotDialog: (dotIndex: number) => void;
      };
      const dotIndex = store.graph.dots.findIndex((candidate) => !candidate.fixed);
      store.openDotDialog(dotIndex >= 0 ? dotIndex : 0);
    });

    const dialog = dialogByTitle(page, "Point parameters");
    await expect(dialog).toBeVisible();

    const fixedCheckbox = dialog.locator('input[type="checkbox"]');
    if (wasFix) {
      await fixedCheckbox.uncheck();
    } else {
      await fixedCheckbox.check();
    }

    await dialog.locator("button:text('Cancel')").click();
    await expect(dialog).not.toBeVisible();

    const after = await getGraphState(page);
    expect(after.dots[0].fixed).toBe(wasFix);
  });

  test("Modify link tool + click on line opens LinePropertiesDialog", async ({ page }) => {
    await createPresetGrid(page, "cell", 3, 3);
    const state = await getGraphState(page);
    const line = state.lines[0];
    const d1 = state.dots[line.dot1];
    const d2 = state.dots[line.dot2];
    const midX = Math.round((d1.x + d2.x) / 2);
    const midY = Math.round((d1.y + d2.y) / 2);

    await selectTool(page, "Modify link");
    await clickCanvas(page, midX, midY);

    const dialog = dialogByTitle(page, "Line Dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".mfc-title")).toHaveText("Line Dialog");
  });

  test("Modify group tool + drag rect opens GroupModifyDialog", async ({ page }) => {
    await createPresetGrid(page, "cell", 3, 3);

    await selectTool(page, "Modify group");
    await dragOnCanvas(page, 10, 10, 500, 500);

    const dialog = dialogByTitle(page, "Modify Group");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".mfc-title")).toHaveText("Modify Group");
  });

  test("GroupModifyDialog has expected fields", async ({ page }) => {
    await createPresetGrid(page, "cell", 3, 3);

    await selectTool(page, "Modify group");
    await dragOnCanvas(page, 10, 10, 500, 500);

    const dialog = dialogByTitle(page, "Modify Group");
    await expect(dialog.locator("text=Max Amplitude")).toBeVisible();
    await expect(dialog.locator("text=Max Weight")).toBeVisible();
    await expect(dialog.locator("text=Stiffness")).toBeVisible();
    await expect(dialog.locator("text=Distribution")).toBeVisible();
  });

  test("Create Piano dialog can be opened from toolbar action", async ({ page }) => {
    await createPresetGrid(page, "cell", 3, 3);
    await page.click('button[title="Generate instrument"]');

    const dialog = dialogByTitle(page, "Create Piano");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".mfc-title")).toHaveText("Create Piano");
  });

  test("Create Piano dialog has Sample Rate and Algorithm fields", async ({ page }) => {
    await createPresetGrid(page, "cell", 3, 3);
    await page.click('button[title="Generate instrument"]');

    const dialog = dialogByTitle(page, "Create Piano");
    await expect(dialog.locator("text=Sample Rate")).toBeVisible();
    await expect(dialog.locator("text=Linear")).toBeVisible();
    await expect(dialog.locator("text=Square")).toBeVisible();
    await expect(dialog.locator("text=Algorithm")).toBeVisible();
  });

  test("CellTemplateDialog applies and creates a graph", async ({ page }) => {
    await page.click('button[title="Add cell graph"]');

    const dialog = dialogByTitle(page, "Cell template");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".mfc-title")).toHaveText("Cell template");

    await dialog.locator("button:text('OK')").click();
    await expect(dialog).not.toBeVisible();

    const state = await getGraphState(page);
    expect(state.dotsCount).toBeGreaterThan(0);
    expect(state.linesCount).toBeGreaterThan(0);
  });

  test("HexTemplateDialog creates graph that fits inside canvas bounds", async ({ page }) => {
    await page.click('button[title="Add hexagonal graph"]');

    const dialog = dialogByTitle(page, "Hex template");
    await expect(dialog).toBeVisible();
    await dialog.locator("button:text('OK')").click();
    await expect(dialog).not.toBeVisible();

    const bounds = await page.evaluate(() => {
      const { graph, canvasSize } = window.__graphStore.getState();
      const xs = graph.dots.map((d: { x: number }) => d.x);
      const ys = graph.dots.map((d: { y: number }) => d.y);

      return {
        dotsCount: graph.dots.length,
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
        width: canvasSize.width,
        height: canvasSize.height,
      };
    });

    expect(bounds.dotsCount).toBeGreaterThan(0);
    expect(bounds.minX).toBeGreaterThanOrEqual(0);
    expect(bounds.maxX).toBeLessThanOrEqual(bounds.width);
    expect(bounds.minY).toBeGreaterThanOrEqual(0);
    expect(bounds.maxY).toBeLessThanOrEqual(bounds.height);
  });
});
