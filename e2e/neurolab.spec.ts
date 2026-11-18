import { type Page, expect, test } from "@playwright/test";

/**
 * NeuroLab: the 3D brain explorer, region pages and the reward-learning simulator.
 * The lab routes need a signed-in user, so those tests are skipped unless E2E_USER_EMAIL and
 * E2E_USER_PASSWORD are set. Saving a run also needs the experiments table.
 */
const email = process.env["E2E_USER_EMAIL"];
const password = process.env["E2E_USER_PASSWORD"];

async function signIn(page: Page, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email").fill(email ?? "");
  await page.getByLabel("Password").fill(password ?? "");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${next.replace(/\//g, "\\/")}$`));
}

test("signed-out visitors are sent to login from NeuroLab", async ({ page }) => {
  await page.goto("/neuro/reward-learning");
  await expect(page).toHaveURL(/\/login\?next=%2Fneuro%2Freward-learning/);
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
    const response = await page.goto("/neuro/regions/not-a-region");
    expect(response?.status()).toBe(404);
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
