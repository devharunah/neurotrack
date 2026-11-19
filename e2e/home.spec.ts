import { expect, test } from "@playwright/test";

// Signed-out flows: start without the saved E2E session.
test.use({ storageState: { cookies: [], origins: [] } });

test("the landing page introduces the three labs", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  for (const lab of ["NeuroLab", "BehaviourLab", "QuantumLab"]) {
    await expect(page.getByText(lab, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByRole("note")).toContainText("Educational and experimental");
});

test("signed-out visitors are sent to login from a lab", async ({ page }) => {
  await page.goto("/quantum");

  await expect(page).toHaveURL(/\/login\?next=%2Fquantum/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});
