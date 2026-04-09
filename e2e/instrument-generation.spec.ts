import { expect, test } from "@playwright/test";
import { createPresetGrid } from "./helpers";

test.describe("Instrument generation progress", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("can cancel generation with titlebar close and start again", async ({ page }) => {
    await createPresetGrid(page, "cell", 3, 3);

    const generateInstrumentButton = page.locator('.piano-panel button[title="Generate instrument"]');
    await expect(generateInstrumentButton).toBeEnabled();

    await generateInstrumentButton.click();
    const generateDialog = page.locator('.mfc-window:has(.mfc-title:has-text("Create Piano"))');
    await expect(generateDialog).toBeVisible();
    await generateDialog.getByRole("button", { name: "Generate!" }).click();

    const progressDialog = page.locator('.mfc-window:has(.mfc-title:has-text("Generating instrument..."))');
    await expect(progressDialog).toBeVisible();

    const closeButton = progressDialog.getByRole("button", { name: "Close dialog" });
    await expect(closeButton).toBeVisible();
    await closeButton.evaluate((node) => (node as HTMLButtonElement).click());
    await expect(progressDialog).toBeHidden();

    await expect(generateInstrumentButton).toBeEnabled({ timeout: 10_000 });
    await generateInstrumentButton.click();
    await expect(generateDialog).toBeVisible();
  });

  test("shows estimation text during generation", async ({ page }) => {
    await createPresetGrid(page, "cell", 3, 3);

    await page.locator('.piano-panel button[title="Generate instrument"]').click();
    const generateDialog = page.locator('.mfc-window:has(.mfc-title:has-text("Create Piano"))');
    await expect(generateDialog).toBeVisible();
    await generateDialog.getByRole("button", { name: "Generate!" }).click();

    const progressDialog = page.locator('.mfc-window:has(.mfc-title:has-text("Generating instrument..."))');
    await expect(progressDialog).toBeVisible();
    await expect(progressDialog).toContainText(/Preparing simulation|Calibrating first note|Generating notes/);
    await expect(progressDialog).toContainText("Estimation:", { timeout: 30_000 });
  });
});
