import { readFileSync } from "node:fs";

import { type Page, expect, test } from "@playwright/test";

/**
 * BehaviourLab: study creation, the synthetic seeder, the dashboard, the association analysis,
 * the audited CSV export, the ethics-gated real-data switch, and the participant flow (consent,
 * check-in, withdrawal). Signed-in tests are skipped unless E2E_USER_EMAIL and E2E_USER_PASSWORD
 * are set; they also need the BehaviourLab migration applied and, for the analysis, the API.
 * Each test creates its own study and deletes it at the end.
 */
const email = process.env["E2E_USER_EMAIL"];
const password = process.env["E2E_USER_PASSWORD"];

/** The session comes from e2e/auth.setup.ts: open the page and confirm we were not bounced. */
async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(page).toHaveURL(new RegExp(`${path.replace(/\//g, "\\/")}$`));
}

async function createStudy(page: Page, title: string): Promise<string> {
  await open(page, "/behaviour");
  const form = page.getByRole("form", { name: "Create a study" });
  await form.getByLabel("Title").fill(title);
  await form.getByRole("button", { name: "Create study" }).click();
  await page.waitForURL(/\/behaviour\/studies\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
  return page.url();
}

async function deleteStudy(page: Page, studyUrl: string, title: string) {
  await page.goto(`${studyUrl}/settings`);
  await page.getByLabel("Type the study title to confirm deletion").fill(title);
  await page.getByRole("button", { name: "Delete study" }).click();
  await page.waitForURL((url) => url.pathname === "/behaviour", { timeout: 15_000 });
}

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("visitors are sent to login from BehaviourLab", async ({ page }) => {
    await page.goto("/behaviour");
    await expect(page).toHaveURL(/\/login\?next=%2Fbehaviour/);
  });

  test("the CSV export is not reachable signed out", async ({ page }) => {
    await page.goto("/behaviour/studies/00000000-0000-0000-0000-000000000000/export");
    await expect(page).toHaveURL(/\/login\?next=/);
  });
});

test.describe("signed in", () => {
  test.skip(!email || !password, "Set E2E_USER_EMAIL and E2E_USER_PASSWORD to run");
  test.describe.configure({ timeout: 120_000 });

  test("a researcher seeds synthetic data, views the dashboard, analyses and exports", async ({
    page,
  }) => {
    const title = `E2E synthetic ${Date.now()}`;
    const studyUrl = await createStudy(page, title);

    await expect(page.getByTestId("synthetic-badge").first()).toBeVisible();
    await expect(page.getByTestId("synthetic-notice")).toBeVisible();

    const seeder = page.getByTestId("seeder");
    await seeder.getByLabel("Participants (3–60)").fill("12");
    await seeder.getByLabel("Days (7–60)").fill("21");
    await seeder.getByRole("button", { name: "Generate synthetic data" }).click();
    await expect(seeder.getByText(/Generated 12 synthetic participants/)).toBeVisible({
      timeout: 30_000,
    });

    await expect(page.getByTestId("study-totals")).toContainText("12");
    for (const chart of [
      "chart-frequency",
      "chart-craving",
      "chart-trends",
      "chart-hour",
      "chart-environment",
      "chart-social",
      "chart-missing",
    ]) {
      await expect(page.getByTestId(chart)).toBeVisible();
    }
    await expect(page.getByTestId("chart-missing")).toContainText(/S-[2-9A-HJ-NP-Z]{4}/);

    const analysis = page.getByTestId("analysis-panel");
    await expect(page.getByTestId("associations-notice")).toContainText("Associations, not causes");
    await analysis.getByRole("button", { name: "Run association analysis" }).click();
    const table = page.getByTestId("associations-table");
    await expect(table).toBeVisible({ timeout: 60_000 });
    await expect(table).toContainText("Stress and craving");
    await expect(table).toContainText("ρ =");
    await expect(analysis).toContainText("SYNTHETIC DATA");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("export-csv").click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/-synthetic-\d{4}-\d{2}-\d{2}\.csv$/);
    const raw = readFileSync(await download.path(), "utf8");
    // The file starts with a UTF-8 byte-order mark for spreadsheet software.
    expect(raw.charCodeAt(0)).toBe(0xfeff);
    const csv = raw.slice(1);
    const [header, firstRow] = csv.split("\r\n");
    expect(header).toMatch(/^pseudonym,synthetic,observed_at_utc/);
    expect(firstRow).toMatch(/^S-[2-9A-HJ-NP-Z]{4},true,/);
    expect(csv).not.toContain(email ?? "@");

    await deleteStudy(page, studyUrl, title);
  });

  test("real data cannot be switched on without an ethics reference", async ({ page }) => {
    const title = `E2E ethics ${Date.now()}`;
    const studyUrl = await createStudy(page, title);
    await page.goto(`${studyUrl}/settings`);

    await page.getByRole("radio", { name: /Real participant data/ }).check();
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "needs an ethics approval reference" }),
    ).toBeVisible();

    await page.getByRole("radio", { name: /Synthetic data/ }).check();
    await page.getByRole("button", { name: "Add a custom question" }).click();
    await page.getByLabel("Question 1", { exact: true }).fill("Hours spent outdoors today?");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.getByText("Settings saved.")).toBeVisible({ timeout: 15_000 });

    await deleteStudy(page, studyUrl, title);
  });

  test("a participant consents, checks in and withdraws", async ({ page }) => {
    const title = `E2E participant ${Date.now()}`;
    const studyUrl = await createStudy(page, title);
    const code = (await page.getByTestId("join-code").textContent())?.trim() ?? "";
    expect(code).toMatch(/^[2-9A-HJ-NP-Z]{8}$/);

    await open(page, "/behaviour");
    const join = page.getByRole("form", { name: "Join with a code" });
    await join.getByLabel("Join code").fill(code.toLowerCase());
    await join.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(new RegExp(`/behaviour/join/${code}$`));

    await expect(page.getByTestId("consent-text")).toContainText("Version 1.0");
    const consent = page.getByRole("button", { name: "I consent, join the study" });
    await expect(consent).toBeDisabled();
    await page.getByRole("checkbox").check();
    await consent.click();
    const success = page.getByTestId("join-success");
    await expect(success).toContainText(/P-[2-9A-HJ-NP-Z]{4,6}/, { timeout: 15_000 });

    await success.getByRole("link", { name: "Go to your first check-in" }).click();
    const form = page.getByTestId("observation-form");
    await expect(form).toBeVisible();
    for (const [prompt, score] of [
      ["mood", "6"],
      ["stressed", "4"],
      ["sleep", "7"],
      ["craving", "2"],
    ] as const) {
      await form
        .getByRole("radiogroup", { name: new RegExp(prompt, "i") })
        .getByText(score, { exact: true })
        .click();
    }
    await form.getByLabel("Where are you?").selectOption("home");
    await form.getByLabel("Who are you with?").selectOption("alone");
    await form.getByRole("button", { name: "Save check-in" }).click();
    await expect(form.getByText("Check-in saved.")).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Withdraw from this study…" }).click();
    await page.getByRole("button", { name: "Confirm withdrawal" }).click();
    await expect(page.getByTestId("consent-withdrawn")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("observation-form")).toHaveCount(0);

    // The researcher's dashboard shows the withdrawal against the pseudonym, never the person.
    await page.goto(studyUrl);
    await expect(page.getByTestId("chart-missing")).toContainText("withdrawn");

    await deleteStudy(page, studyUrl, title);
  });
});
