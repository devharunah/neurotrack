import { type Page, expect, test } from "@playwright/test";

/**
 * NeuroLab: the 3D brain explorer, region pages and the reward-learning simulator.
 * The lab routes need a signed-in user, so those tests are skipped unless E2E_USER_EMAIL and
 * E2E_USER_PASSWORD are set. Saving a run also needs the experiments table.
 */
const email = process.env["E2E_USER_EMAIL"];
const password = process.env["E2E_USER_PASSWORD"];

/**
 * On a desktop viewport narrower than 1536px the structure list starts collapsed behind a
 * "Structures ›" button; on wider screens and on mobile it is already open.
 */
async function openStructureList(page: Page) {
  await explorerReady(page);
  const toggle = page.getByRole("button", { name: "Structures ›" });
  if (await toggle.isVisible()) await toggle.click();
}

/** The explorer has hydrated: the 3D stage (or the no-WebGL notice) replaced the placeholder. */
async function explorerReady(page: Page) {
  await expect(
    page.getByTestId("brain-canvas").or(page.getByTestId("webgl-fallback")),
  ).toBeVisible();
}

/** The session comes from e2e/auth.setup.ts: open the page and confirm we were not bounced. */
async function signIn(page: Page, next: string) {
  await page.goto(next);
  await expect(page).toHaveURL(new RegExp(`${next.replace(/\//g, "\\/")}$`));
}

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("visitors are sent to login from NeuroLab", async ({ page }) => {
    await page.goto("/neuro/reward-learning");
    await expect(page).toHaveURL(/\/login\?next=%2Fneuro%2Freward-learning/);
  });
});

test.describe("signed in", () => {
  test.skip(!email || !password, "Set E2E_USER_EMAIL and E2E_USER_PASSWORD to run");

  test("the explorer selects a region from the keyboard list and links to its page", async ({
    page,
  }) => {
    await signIn(page, "/neuro");
    await expect(page.getByRole("heading", { name: "NeuroLab", level: 1 })).toBeVisible();
    // Either the 3D canvas or the no-WebGL notice is shown; the lists work in both cases.
    await expect(
      page.getByTestId("brain-canvas").or(page.getByTestId("webgl-fallback")),
    ).toBeVisible();

    await openStructureList(page);
    const structures = page.getByRole("navigation", { name: "Brain structures" });
    await expect(structures.getByRole("button")).toHaveCount(9);

    await page.getByRole("button", { name: "Reward circuit", exact: true }).click();
    const regions = page.getByRole("navigation", { name: "Deep structures" });
    // The six reward-circuit regions, then the thalamus and hypothalamus.
    await expect(regions.getByRole("button")).toHaveCount(8);

    const accumbens = regions.getByRole("button", { name: "Nucleus accumbens" });
    await accumbens.focus();
    await page.keyboard.press("Enter");
    await expect(accumbens).toHaveAttribute("aria-pressed", "true");

    const panel = page.getByTestId("region-panel");
    await expect(panel.getByRole("heading", { name: "Nucleus accumbens" })).toBeVisible();
    // The selection is shareable: it is mirrored into the URL without a navigation.
    await expect(page).toHaveURL(/\/neuro\?mode=deep&s=nucleus-accumbens$/);
    await panel.getByRole("link", { name: /Read more/ }).click();

    await expect(page).toHaveURL(/\/neuro\/regions\/nucleus-accumbens$/);
    await expect(page.getByRole("heading", { name: "Nucleus accumbens", level: 1 })).toBeVisible();
    const references = page.getByRole("region", { name: "References" });
    const doiLinks = references.locator('a[href^="https://doi.org/10."]');
    expect(await doiLinks.count()).toBeGreaterThanOrEqual(2);
  });

  test("the VTA is marked as an approximate location", async ({ page }) => {
    await page.goto("/neuro?mode=deep&s=ventral-tegmental-area");
    await openStructureList(page);
    const panel = page.getByTestId("region-panel");
    await expect(panel.getByText("Approximate location", { exact: true })).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Deep structures" })
        .getByRole("button", { name: "Ventral tegmental area (approx.)" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("a deep link opens an anatomy structure with sourced content", async ({ page }) => {
    await page.goto("/neuro?s=cerebellum");
    await openStructureList(page);
    const panel = page.getByTestId("region-panel");
    await expect(panel.getByRole("heading", { name: "Cerebellum" })).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Brain structures" })
        .getByRole("button", { name: "Cerebellum" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(panel.getByRole("link", { name: "DOI" }).first()).toHaveAttribute(
      "href",
      /^https:\/\/doi\.org\/10\./,
    );

    await page.keyboard.press("Escape");
    await expect(panel.getByRole("heading", { name: "Explore the brain" })).toBeVisible();
    await expect(page).toHaveURL(/\/neuro$/);
  });

  test("the 3D model loads without CSP violations", async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && /Content Security Policy/i.test(message.text())) {
        violations.push(message.text());
      }
    });
    await signIn(page, "/neuro");
    const fallback = page.getByTestId("webgl-fallback");
    test.skip(await fallback.isVisible(), "This browser has no WebGL");
    // The meshopt decoder needs 'wasm-unsafe-eval'; a blocked decoder never reaches ready.
    await expect(page.getByTestId("brain-canvas")).toHaveAttribute("data-ready", "true", {
      timeout: 30_000,
    });
    await expect(page.getByTestId("brain-canvas").locator("canvas")).toBeVisible();
    expect(violations).toEqual([]);

    // The model's file name is content-hashed, so it is cached as immutable.
    const modelUrl = await page.evaluate(
      () =>
        performance
          .getEntriesByType("resource")
          .map((entry) => entry.name)
          .find((name) => /\/models\/brain\.[0-9a-f]{10}\.glb$/.test(name)) ?? "",
    );
    expect(modelUrl).not.toBe("");
    const response = await page.request.get(modelUrl);
    expect(response.headers()["cache-control"]).toContain("immutable");
  });

  test("keyboard shortcuts change the view and search filters the list", async ({ page }) => {
    await signIn(page, "/neuro");
    await explorerReady(page);
    await page.keyboard.press("1");
    await expect(page).toHaveURL(/[?&]view=left$/);
    await page.keyboard.press("0");
    await expect(page).toHaveURL(/\/neuro$/);

    await openStructureList(page);
    const list = page.getByRole("navigation", { name: "Brain structures" });
    await list.getByRole("searchbox").fill("lobe");
    // Frontal, parietal, temporal, occipital and the limbic lobe.
    await expect(list.getByRole("button")).toHaveCount(5);
    await list.getByRole("searchbox").fill("zzz");
    await expect(list.getByText(/No structure matches/)).toBeVisible();
  });

  test("an unknown region slug shows the not-found page", async ({ page }) => {
    await signIn(page, "/neuro");
    // Lab pages stream behind (app)/loading.tsx, so Next has already sent a 200 by the time
    // notFound() runs. Next documents this and marks the page noindex; assert the user-visible
    // not-found view and that marker instead of the status code.
    await page.goto("/neuro/regions/not-a-region");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
    await expect(page.locator('meta[name="robots"][content*="noindex"]').first()).toBeAttached();
  });

  test("the simulator recomputes instantly and labels stress as hypothetical", async ({ page }) => {
    await signIn(page, "/neuro/reward-learning");

    await expect(page.getByText("(hypothetical modulation)")).toBeVisible();
    await expect(page.getByTestId("rw-value-chart")).toBeVisible();
    await expect(page.getByTestId("td-shift-chart")).toBeVisible();
    await expect(page.getByTestId("td-heatstrip")).toBeVisible();

    const summary = page.getByTestId("rw-summary");
    await expect(summary).toContainText("40/40");

    // Extinction: V decays back towards 0 after 30 rewarded trials.
    await page.getByRole("button", { name: "Extinction" }).click();
    await expect(summary).toContainText("30/70");
    const finalV = Number(await summary.locator("dd").first().textContent());
    expect(finalV).toBeLessThan(0.05);

    // TD: δ has moved from the reward to the cue by the last trial.
    await expect(page.getByTestId("td-summary")).toContainText("Trial 120");

    // Stress at full level halves the reward the model sees: 0.5 · (1 − 0.85^40) ≈ 0.499.
    await page.getByRole("button", { name: "Acquisition" }).click();
    await page.getByLabel("Stress level s").fill("1");
    await expect(summary.locator("dd").first()).toHaveText("0.499");
  });

  test("a run can be saved to the history", async ({ page }) => {
    await signIn(page, "/neuro/reward-learning");
    await page.getByRole("button", { name: "Save this run" }).first().click();
    await expect(page.getByText("Run saved to your history.")).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(page.getByTestId("neuro-run-history")).toContainText("Rescorla-Wagner");
  });
});

test.describe("signed in, phone", () => {
  test.skip(!email || !password, "Set E2E_USER_EMAIL and E2E_USER_PASSWORD to run");
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("details open in a bottom sheet that expands", async ({ page }) => {
    await signIn(page, "/neuro");
    const list = page.getByRole("navigation", { name: "Brain structures" });
    await list.getByRole("button", { name: "Temporal lobe" }).click();

    const panel = page.getByTestId("region-panel");
    await expect(panel.getByRole("heading", { name: "Temporal lobe" })).toBeVisible();
    const toggle = page.getByRole("button", { name: "Show more" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click();
    await expect(page.getByRole("button", { name: "Show less" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    // Nothing on the page is wider than the phone screen.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("signed in, reduced motion", () => {
  test.skip(!email || !password, "Set E2E_USER_EMAIL and E2E_USER_PASSWORD to run");
  test.use({ reducedMotion: "reduce" });

  test("auto-rotation is off and says why", async ({ page }) => {
    await signIn(page, "/neuro");
    await expect(page.getByText(/Auto-rotation is off because your system asks/)).toBeVisible();
    await expect(page.getByRole("button", { name: /rotation/ })).toBeDisabled();
  });
});

test.describe("signed in, no WebGL", () => {
  test.skip(!email || !password, "Set E2E_USER_EMAIL and E2E_USER_PASSWORD to run");
  test("the lists and panel still work without the 3D view", async ({ page }) => {
    // Make every WebGL context request fail, as on a browser or device without WebGL.
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function getContext(
        this: HTMLCanvasElement,
        type: string,
        ...rest: unknown[]
      ) {
        if (type === "webgl" || type === "webgl2" || type === "experimental-webgl") return null;
        return (original as (...args: unknown[]) => RenderingContext | null).call(
          this,
          type,
          ...rest,
        );
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    await signIn(page, "/neuro");
    await expect(page.getByTestId("webgl-fallback")).toBeVisible();
    await expect(page.getByTestId("brain-canvas")).toHaveCount(0);
    await page
      .getByRole("navigation", { name: "Brain structures" })
      .getByRole("button", { name: "Insula" })
      .click();
    await expect(
      page.getByTestId("region-panel").getByRole("heading", { name: "Insula" }),
    ).toBeVisible();
  });
});
