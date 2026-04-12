import { expect, test, type Locator } from "@playwright/test";
import { createPresetGrid } from "./helpers";

/** Fewer octaves, low sample rate, short duration — keeps calibration + note gen within CI time limits. */
async function applyFastInstrumentGenerationDefaults(generateDialog: Locator) {
  await generateDialog.getByRole("group", { name: "Generate Octaves" }).getByRole("radio", { name: "1" }).click();
  await generateDialog.getByRole("group", { name: "Sample Rate" }).getByRole("radio", { name: "8000" }).click();
  const durationInput = generateDialog.getByLabel("milSeconds");
  await durationInput.fill("100");
}

test.describe("Instrument generation progress", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("can cancel generation during progress (Escape) and start again", async ({ page }) => {
    await createPresetGrid(page, "cell", 3, 3);

    const generateInstrumentButton = page.locator('.piano-panel button[title="Generate instrument"]');
    await expect(generateInstrumentButton).toBeEnabled();

    await generateInstrumentButton.click();
    const generateDialog = page.locator('.mfc-window:has(.mfc-title:has-text("Create Piano"))');
    await expect(generateDialog).toBeVisible();
    await generateDialog.getByRole("button", { name: "Generate!" }).click();

    const progressDialog = page.locator('.mfc-window:has(.mfc-title:has-text("Generating instrument..."))');
    await expect(progressDialog).toBeVisible();

    await expect(progressDialog.getByRole("button", { name: "Close dialog" })).toBeVisible();
    // Progress updates re-render the dialog and detach the titlebar button; Escape closes via MfcDialog's document listener.
    await page.keyboard.press("Escape");
    await expect(progressDialog).toBeHidden();

    await expect(generateInstrumentButton).toBeEnabled({ timeout: 10_000 });
    await generateInstrumentButton.click();
    await expect(generateDialog).toBeVisible();
  });

  test("shows estimation text during generation", async ({ page }) => {
    test.setTimeout(120_000);
    await createPresetGrid(page, "cell", 3, 3);

    await page.locator('.piano-panel button[title="Generate instrument"]').click();
    const generateDialog = page.locator('.mfc-window:has(.mfc-title:has-text("Create Piano"))');
    await expect(generateDialog).toBeVisible();
    await applyFastInstrumentGenerationDefaults(generateDialog);
    await generateDialog.getByRole("button", { name: "Generate!" }).click();

    const progressDialog = page.locator('.mfc-window:has(.mfc-title:has-text("Generating instrument..."))');
    await expect(progressDialog).toBeVisible();
    await expect(progressDialog).toContainText(/Preparing simulation|Calibrating first note|Generating notes/);
    // "Estimation:" appears only in the "Generating notes …" label, after calibration completes.
    await expect(progressDialog).toContainText("Estimation:", { timeout: 90_000 });
  });
});
