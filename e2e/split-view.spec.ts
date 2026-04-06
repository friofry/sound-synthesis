import { expect, test } from "@playwright/test";

test.describe("MfcSplitView", () => {
  test("resizes panes with horizontal and vertical splitters", async ({ page }) => {
    await page.goto("/");

    const horizontalSplitter = page.locator(".workspace-layout .mfc-split-view.is-horizontal > .mfc-splitter").first();
    const verticalSplitters = page.locator(".modeller-right-column > .mfc-splitter");
    const leftPane = page.locator(".graph-pane");
    const rightPane = page.locator(".modeller-right-column");
    const rightPanes = page.locator(".modeller-right-column > .mfc-split-pane");
    const upperMidPane = rightPanes.nth(1);
    const lowerMidPane = rightPanes.nth(2);

    await expect(horizontalSplitter).toBeVisible();
    await expect(verticalSplitters).toHaveCount(3);
    await expect(rightPanes).toHaveCount(4);
    await expect(leftPane).toBeVisible();
    await expect(rightPane).toBeVisible();
    await expect(upperMidPane).toBeVisible();
    await expect(lowerMidPane).toBeVisible();

    const leftBefore = await leftPane.boundingBox();
    const rightBefore = await rightPane.boundingBox();
    const horizontalBox = await horizontalSplitter.boundingBox();
    if (!leftBefore || !rightBefore || !horizontalBox) throw new Error("Horizontal split view elements are not measurable");

    const startX = horizontalBox.x + horizontalBox.width / 2;
    const startY = horizontalBox.y + horizontalBox.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 160, startY, { steps: 8 });
    await page.mouse.up();

    const leftAfter = await leftPane.boundingBox();
    const rightAfter = await rightPane.boundingBox();
    if (!leftAfter || !rightAfter) throw new Error("Split view panes are not measurable after drag");

    expect(leftAfter.width).toBeGreaterThan(leftBefore.width + 100);
    expect(rightAfter.width).toBeLessThan(rightBefore.width - 100);

    const verticalSplitter = verticalSplitters.first();
    const verticalBox = await verticalSplitter.boundingBox();
    if (!verticalBox) throw new Error("Vertical split view elements are not measurable");

    const readPaneHeights = async () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll(".modeller-right-column > .mfc-split-pane")).map((node) =>
          Math.round((node as HTMLElement).getBoundingClientRect().height),
        ),
      );

    const heightsBefore = await readPaneHeights();

    const verticalStartX = verticalBox.x + verticalBox.width / 2;
    const verticalStartY = verticalBox.y + verticalBox.height / 2;
    await page.mouse.move(verticalStartX, verticalStartY);
    await page.mouse.down();
    await page.mouse.move(verticalStartX, verticalStartY - 80, { steps: 8 });
    await page.mouse.up();

    const heightsAfter = await readPaneHeights();
    const upperDelta = heightsAfter[0] - heightsBefore[0];
    const lowerDelta = heightsAfter[1] - heightsBefore[1];

    expect(Math.abs(upperDelta)).toBeGreaterThan(20);
    expect(Math.abs(lowerDelta)).toBeGreaterThan(20);
    expect(upperDelta * lowerDelta).toBeLessThan(0);
  });

  test("keeps both panes above minimum width when dragged to edges", async ({ page }) => {
    await page.goto("/");

    const splitter = page.locator(".workspace-layout .mfc-split-view.is-horizontal > .mfc-splitter").first();
    const leftPane = page.locator(".graph-pane");
    const rightPane = page.locator(".modeller-right-column");

    const splitterBox = await splitter.boundingBox();
    if (!splitterBox) throw new Error("Splitter is not measurable");

    const startX = splitterBox.x + splitterBox.width / 2;
    const centerY = splitterBox.y + splitterBox.height / 2;

    await page.mouse.move(startX, centerY);
    await page.mouse.down();
    await page.mouse.move(splitterBox.x - 1000, centerY, { steps: 8 });
    await page.mouse.up();

    const leftAfterMinDrag = await leftPane.boundingBox();
    const rightAfterMinDrag = await rightPane.boundingBox();
    if (!leftAfterMinDrag || !rightAfterMinDrag) throw new Error("Panes are not measurable after min drag");

    expect(leftAfterMinDrag.width).toBeGreaterThanOrEqual(270);
    expect(rightAfterMinDrag.width).toBeGreaterThanOrEqual(270);

    const splitterBoxAgain = await splitter.boundingBox();
    if (!splitterBoxAgain) throw new Error("Splitter is not measurable after first edge drag");

    const startXAgain = splitterBoxAgain.x + splitterBoxAgain.width / 2;
    const centerYAgain = splitterBoxAgain.y + splitterBoxAgain.height / 2;
    await page.mouse.move(startXAgain, centerYAgain);
    await page.mouse.down();
    await page.mouse.move(splitterBoxAgain.x + 2000, centerYAgain, { steps: 8 });
    await page.mouse.up();

    const leftAfterMaxDrag = await leftPane.boundingBox();
    const rightAfterMaxDrag = await rightPane.boundingBox();
    if (!leftAfterMaxDrag || !rightAfterMaxDrag) throw new Error("Panes are not measurable after max drag");

    expect(leftAfterMaxDrag.width).toBeGreaterThanOrEqual(270);
    expect(rightAfterMaxDrag.width).toBeGreaterThanOrEqual(270);
  });

  test("dragging first vertical splitter only affects panes 0 and 1", async ({ page }) => {
    await page.goto("/");

    const readPaneHeights = () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll(".modeller-right-column > .mfc-split-pane")).map((node) =>
          Math.round((node as HTMLElement).getBoundingClientRect().height),
        ),
      );

    const splitters = page.locator(".modeller-right-column > .mfc-splitter");
    await expect(splitters).toHaveCount(3);

    const heightsBefore = await readPaneHeights();
    expect(heightsBefore).toHaveLength(4);

    const firstSplitter = splitters.first();
    const box = await firstSplitter.boundingBox();
    if (!box) throw new Error("First vertical splitter is not measurable");

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx, cy - 60, { steps: 8 });
    await page.mouse.up();

    const heightsAfter = await readPaneHeights();

    const delta0 = heightsAfter[0] - heightsBefore[0];
    const delta1 = heightsAfter[1] - heightsBefore[1];
    const delta2 = heightsAfter[2] - heightsBefore[2];
    const delta3 = heightsAfter[3] - heightsBefore[3];

    expect(Math.abs(delta0)).toBeGreaterThan(30);
    expect(Math.abs(delta1)).toBeGreaterThan(30);
    expect(Math.abs(delta0 + delta1)).toBeLessThanOrEqual(1);

    expect(Math.abs(delta2)).toBeLessThanOrEqual(1);
    expect(Math.abs(delta3)).toBeLessThanOrEqual(1);
  });
});
