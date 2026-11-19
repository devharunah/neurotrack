import { type Page, expect, test } from "@playwright/test";

/**
 * NeuroLab: the 3D brain explorer, region pages and the reward-learning simulator.
 * The lab routes need a signed-in user, so those tests are skipped unless E2E_USER_EMAIL and
 * E2E_USER_PASSWORD are set. Saving a run also needs the experiments table.
 */
const email = process.env["E2E_USER_EMAIL"];
const password = process.env["E2E_USER_PASSWORD"];

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

    const regions = page.getByRole("navigation", { name: "Brain regions" });
    await expect(regions.getByRole("button")).toHaveCount(6);
    // Either the 3D canvas or the no-WebGL notice is shown; the list works in both cases.
    await expect(
      page.getByTestId("brain-canvas").or(page.getByTestId("webgl-fallback")),
    ).toBeVisible();

    const accumbens = regions.getByRole("button", { name: "Nucleus accumbens" });
    await accumbens.focus();
    await page.keyboard.press("Enter");
    await expect(accumbens).toHaveAttribute("aria-pressed", "true");

    const panel = page.getByTestId("region-panel");
    await expect(panel.getByRole("heading", { name: "Nucleus accumbens" })).toBeVisible();
    await panel.getByRole("link", { name: /Read more/ }).click();

    await expect(page).toHaveURL(/\/neuro\/regions\/nucleus-accumbens$/);
    await expect(page.getByRole("heading", { name: "Nucleus accumbens", level: 1 })).toBeVisible();
    const references = page.getByRole("region", { name: "References" });
    const doiLinks = references.locator('a[href^="https://doi.org/10."]');
    expect(await doiLinks.count()).toBeGreaterThanOrEqual(2);
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
