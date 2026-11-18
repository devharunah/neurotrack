import { expect, test } from "@playwright/test";

/**
 * Full stack: Supabase auth, Next.js Server Action, FastAPI, Qiskit Aer, and the experiments table.
 * Needs a real test user and the API running (`pnpm dev:api`), so it is skipped unless
 * E2E_USER_EMAIL and E2E_USER_PASSWORD are set.
 */
const email = process.env["E2E_USER_EMAIL"];
const password = process.env["E2E_USER_PASSWORD"];

test.skip(!email || !password, "Set E2E_USER_EMAIL and E2E_USER_PASSWORD to run");

test("a Bell-state run shows only 00 and 11 and is saved to history", async ({ page }) => {
  await page.goto("/login?next=/quantum");
  await page.getByLabel("Email").fill(email ?? "");
  await page.getByLabel("Password").fill(password ?? "");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/quantum$/);

  await page.getByRole("button", { name: "Bell state" }).click();
  await page.getByRole("button", { name: "Run on simulator" }).click();

  const results = page.getByRole("region", { name: "Results" });
  await expect(results).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("histogram")).toBeVisible();
  await expect(results).toContainText("saved to history");

  await results.getByText("Statevector (exact amplitudes)").click();
  await expect(results.getByRole("row", { name: /\|00⟩.*50\.0%/ })).toBeVisible();
  await expect(results.getByRole("row", { name: /\|11⟩.*50\.0%/ })).toBeVisible();
  await expect(results.getByRole("row", { name: /\|01⟩.*0\.0%/ })).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("run-history")).toContainText("2-qubit circuit, 2 gates");
});
