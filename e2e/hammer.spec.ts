import { expect, test, type Page } from "@playwright/test";
import {
  chooseHammerPointOutsideRandomZone,
  clearHammerPreview,
  collectZoneMetrics,
  estimateRandomCenter,
  estimateRandomRadius,
  getGraphState,
  getHammerPreviewMetrics,
  getLastHammerImpact,
  getPianoActiveBufferInfo,
  getViewerRuntimeState,
  getViewerSnapshotDots,
  getViewerStatus,
  hammerStrikeOnCanvas,
  waitForE2EHarness,
} from "./helpers";

const RANDOM_BUTTON_LABEL = "Random preset + generate octaves (2)";
const HAMMER_RADIUS = 24;

type HammerScenario = {
  randomCenter: { x: number; y: number };
  randomRadius: number;
  hammerPoint: { x: number; y: number };
  hammerRadius: number;
};

async function prepareRandomAndHammer(page: Page): Promise<HammerScenario> {
  await page.goto("/");
  await waitForE2EHarness(page);
  await clearHammerPreview(page);

  await page.click(`button[aria-label="${RANDOM_BUTTON_LABEL}"]`);

  await expect
    .poll(
      async () => {
        const graph = await getGraphState(page);
        return graph.dotsCount;
      },
      { timeout: 90_000 },
    )
    .toBeGreaterThan(0);

  await expect
    .poll(
      async () => {
        const graph = await getGraphState(page);
        let maxAbsU = 0;
        for (const dot of graph.dots) {
          maxAbsU = Math.max(maxAbsU, Math.abs(dot.u));
        }
        return maxAbsU;
      },
      { timeout: 90_000 },
    )
    .toBeGreaterThan(1e-4);

  const graph = await getGraphState(page);
  const randomCenter = estimateRandomCenter(graph.dots);
  const randomRadius = Math.max(24, estimateRandomRadius(graph.dots, randomCenter));
  const hammerPoint = chooseHammerPointOutsideRandomZone(
    graph.dots,
    randomCenter,
    randomRadius + HAMMER_RADIUS + 12,
  );

  await page.evaluate(
    ({ radius }) => {
      const state = window.__graphStore.getState();
      state.setTool("hammer");
      state.setHammerSettings({
        radius,
        velocity: 0.9,
        weight: 0.08,
        restitution: 0.5,
        distribution: "smoothed",
      });
    },
    { radius: HAMMER_RADIUS },
  );

  const actualHammerPoint = await hammerStrikeOnCanvas(page, hammerPoint, 320);

  await expect
    .poll(
      async () => {
        const impact = await getLastHammerImpact(page);
        return impact ? impact.radius : 0;
      },
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0);

  const distanceBetweenCenters = Math.hypot(
    actualHammerPoint.x - randomCenter.x,
    actualHammerPoint.y - randomCenter.y,
  );
  expect(distanceBetweenCenters).toBeGreaterThan(HAMMER_RADIUS);

  return {
    randomCenter,
    randomRadius,
    hammerPoint: actualHammerPoint,
    hammerRadius: HAMMER_RADIUS,
  };
}

test.describe("Hammer E2E", () => {
  test.setTimeout(120_000);

  test("hammer gives non-silent preview audio", async ({ page }) => {
    await prepareRandomAndHammer(page);

    await expect
      .poll(
        async () => {
          const metrics = await getHammerPreviewMetrics(page);
          return metrics.available ? metrics.nonZeroCount : 0;
        },
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0);

    const metrics = await getHammerPreviewMetrics(page);
    expect(metrics.length).toBeGreaterThan(0);
    expect(metrics.maxAbs).toBeGreaterThan(1e-5);
    expect(metrics.rms).toBeGreaterThan(1e-6);

    const bufferInfo = await getPianoActiveBufferInfo(page);
    expect(bufferInfo.length).toBeGreaterThan(0);
    expect(bufferInfo.sampleRate).toBeGreaterThan(1000);
  });

  test("viewer switches to live/impact path and early samples show hammer-region motion while random center is zeroed", async ({ page }) => {
    const scenario = await prepareRandomAndHammer(page);

    await expect
      .poll(async () => (await getViewerStatus(page)).activeSource, { timeout: 10_000 })
      .toBe("tool-preview");
    await expect
      .poll(async () => ((await getViewerStatus(page)).playing ? 1 : 0), { timeout: 10_000 })
      .toBe(1);
    await expect
      .poll(async () => ((await getViewerRuntimeState(page)) ? 1 : 0), { timeout: 20_000 })
      .toBe(1);

    const viewerDots = await getViewerSnapshotDots(page);
    const runtime = await getViewerRuntimeState(page);
    if (!runtime) {
      throw new Error("Viewer runtime state is unavailable");
    }

    const zoneMetrics = collectZoneMetrics({
      dots: viewerDots,
      values: runtime.u,
      hammerCenter: scenario.hammerPoint,
      hammerRadius: scenario.hammerRadius,
      randomCenter: scenario.randomCenter,
      randomRadius: scenario.randomRadius,
      epsilon: 1e-6,
    });

    expect(zoneMetrics.hammer.nonZeroCount).toBeGreaterThan(0);
    expect(zoneMetrics.hammer.maxAbs).toBeGreaterThan(1e-6);
    // Random preset region should stay nearly still; allow tiny coupling / float noise (~1e-4).
    expect(zoneMetrics.random.maxAbs).toBeLessThan(1e-4);
    expect(zoneMetrics.random.maxAbs).toBeLessThan(zoneMetrics.hammer.maxAbs * 0.5);
  });

  test("non-zero only inside hammer radius", async ({ page }) => {
    const scenario = await prepareRandomAndHammer(page);
    const viewerDots = await getViewerSnapshotDots(page);

    const uZoneMetrics = collectZoneMetrics({
      dots: viewerDots,
      values: viewerDots.map((dot) => dot.u),
      hammerCenter: scenario.hammerPoint,
      hammerRadius: scenario.hammerRadius,
      randomCenter: scenario.randomCenter,
      randomRadius: scenario.randomRadius,
      epsilon: 1e-8,
    });

    const vZoneMetrics = collectZoneMetrics({
      dots: viewerDots,
      values: viewerDots.map((dot) => dot.v),
      hammerCenter: scenario.hammerPoint,
      hammerRadius: scenario.hammerRadius,
      randomCenter: scenario.randomCenter,
      randomRadius: scenario.randomRadius,
      epsilon: 1e-8,
    });

    expect(uZoneMetrics.outside.nonZeroCount).toBe(0);
    expect(vZoneMetrics.outside.nonZeroCount).toBe(0);
  });

  test("random perturbations are zeroed before viewer starts", async ({ page }) => {
    const scenario = await prepareRandomAndHammer(page);
    const viewerDots = await getViewerSnapshotDots(page);

    const zoneMetrics = collectZoneMetrics({
      dots: viewerDots,
      values: viewerDots.map((dot) => dot.u),
      hammerCenter: scenario.hammerPoint,
      hammerRadius: scenario.hammerRadius,
      randomCenter: scenario.randomCenter,
      randomRadius: scenario.randomRadius,
      epsilon: 1e-8,
    });

    expect(zoneMetrics.random.nonZeroCount).toBe(0);
    expect(zoneMetrics.random.maxAbs).toBeLessThan(1e-8);
  });
});
