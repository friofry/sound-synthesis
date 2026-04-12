import { test, expect } from "@playwright/test";
import { switchToWindowPage } from "./helpers";

test.describe("Piano Toolbar on Membrane Modeller", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("piano toolbar is visible in the piano panel", async ({ page }) => {
    const toolbar = page.locator(".piano-panel .piano-toolbar-panel");
    await expect(toolbar).toBeVisible();
  });

  test("piano keyboard is visible below the toolbar", async ({ page }) => {
    const keyboard = page.locator('.piano-panel svg[preserveAspectRatio="none"]');
    await expect(keyboard).toBeVisible();
  });

  test("toolbar has all expected buttons", async ({ page }) => {
    const panel = page.locator(".piano-panel .piano-toolbar-panel");
    await expect(panel.locator('button[title="Generate one note"]')).toBeVisible();
    await expect(panel.locator('button[title="Generate instrument"]')).toBeVisible();
    await expect(panel.locator('button[title="Record"]')).toBeVisible();
    await expect(panel.locator('button[title="Stop"]')).toBeVisible();
    await expect(panel.locator('button[title="Save instrument"]')).toBeVisible();
    await expect(panel.locator('button[title="Load instrument"]')).toBeVisible();
    await expect(panel.locator('button[title="Save melody to file (SNC)"]')).toBeVisible();
    await expect(panel.locator('button[title="Play melody from file (SNC, MIDI)"]')).toBeVisible();
  });

  test("toolbar has separators between button groups", async ({ page }) => {
    const panel = page.locator(".piano-panel .piano-toolbar-mfc");
    const separators = panel.locator('[role="separator"]');
    // sep after gen / after record / after load instrument + optional sep before Window nav (Membrane Modeller).
    await expect(separators).toHaveCount(4);
  });

  test("toolbar is rendered above the keyboard", async ({ page }) => {
    const toolbarBox = await page.locator(".piano-panel .piano-toolbar-panel").boundingBox();
    const keyboardBox = await page.locator('.piano-panel svg[preserveAspectRatio="none"]').boundingBox();
    expect(toolbarBox).not.toBeNull();
    expect(keyboardBox).not.toBeNull();
    expect(toolbarBox!.y + toolbarBox!.height).toBeLessThanOrEqual(keyboardBox!.y + 2);
  });

  test("Generate one note button is clickable", async ({ page }) => {
    const btn = page.locator('.piano-panel button[title="Generate one note"]');
    await expect(btn).toBeEnabled();
    await btn.click();
  });

  test("Generate instrument button is clickable", async ({ page }) => {
    const btn = page.locator('.piano-panel button[title="Generate instrument"]');
    await expect(btn).toBeEnabled();
    await btn.click();
  });

  test("Stop is disabled by default, Record enables it", async ({ page }) => {
    const panel = page.locator(".piano-panel .piano-toolbar-panel");
    const recordBtn = panel.locator('button[title="Record"]');
    const stopBtn = panel.locator('button[title="Stop"]');

    await expect(recordBtn).toBeEnabled();
    await expect(stopBtn).toBeDisabled();

    await recordBtn.click();

    await expect(recordBtn).toBeDisabled();
    await expect(stopBtn).toBeEnabled();
  });

  test("buttons are borderless in normal state", async ({ page }) => {
    const btn = page.locator('.piano-panel button[title="Generate one note"]');
    await expect(btn).toHaveCSS("border-top-width", "0px");
    await expect(btn).toHaveCSS("box-shadow", "none");
  });
});

test.describe("Piano Toolbar on Piano Player page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await switchToWindowPage(page, "Piano Player");
  });

  test("piano toolbar is visible", async ({ page }) => {
    const toolbar = page.locator(".piano-toolbar-panel");
    await expect(toolbar).toBeVisible();
  });

  test("toolbar has all expected buttons", async ({ page }) => {
    const panel = page.locator(".piano-toolbar-panel");
    await expect(panel.locator('button[title="Generate one note"]')).toBeVisible();
    await expect(panel.locator('button[title="Generate instrument"]')).toBeVisible();
    await expect(panel.locator('button[title="Record"]')).toBeVisible();
    await expect(panel.locator('button[title="Stop"]')).toBeVisible();
    await expect(panel.locator('button[title="Save instrument"]')).toBeVisible();
    await expect(panel.locator('button[title="Load instrument"]')).toBeVisible();
    await expect(panel.locator('button[title="Save melody to file (SNC)"]')).toBeVisible();
    await expect(panel.locator('button[title="Play melody from file (SNC, MIDI)"]')).toBeVisible();
  });

  test("Stop is disabled by default, Record enables it", async ({ page }) => {
    const panel = page.locator(".piano-toolbar-panel");
    const recordBtn = panel.locator('button[title="Record"]');
    const stopBtn = panel.locator('button[title="Stop"]');

    await expect(recordBtn).toBeEnabled();
    await expect(stopBtn).toBeDisabled();

    await recordBtn.click();

    await expect(recordBtn).toBeDisabled();
    await expect(stopBtn).toBeEnabled();
  });
});
